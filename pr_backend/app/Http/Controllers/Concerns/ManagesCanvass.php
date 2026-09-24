<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Rfq;
use App\Models\RfqItem;
use App\Models\RfqQuoteItem;
use App\Models\RfqSupplier;
use App\Models\User;
use App\Support\PortalToken;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * The flowchart's green-lane canvass, shared by the staff RFQ screens, the public Supplier Portal,
 * and the hourly no-reply sweep:
 *
 *   Send RFQ -> Supplier receives RFQ (Supplier Portal) -> Does supplier reply?
 *     Yes -> Supplier sends back signed quotation -> Procurement category check
 *     No (after 7 calendar days) -> Cancel sent RFQ of non-responding supplier -> Choose n of supplier
 *
 * Needs HasProcurementHelpers on the same class (notify, sendEmail, frontendUrl, designated*).
 */
trait ManagesCanvass
{
    /** Calendar days a supplier has to reply to an RFQ. */
    private int $replyWindowDays = 7;

    /** Private disk folder for uploaded signed quotations. */
    private string $quotationFolder = 'rfq-quotations';

    /**
     * Issues (or re-issues) a supplier's portal link and emails it when the supplier has an address.
     * Returns the link so staff can hand it over another way; only its hash is stored.
     */
    private function issueRfqPortalLink(RfqSupplier $rfqSupplier): string
    {
        $token = PortalToken::issue();
        $rfqSupplier->forceFill([
            'portal_token_hash' => $token['hash'],
            'portal_token_expires_at' => $rfqSupplier->reply_due_at,
        ])->save();

        $url = $this->frontendUrl('/portal/rfq/'.$token['plain']);
        $rfq = $rfqSupplier->rfq;
        $due = $rfqSupplier->reply_due_at?->timezone('Asia/Manila')->format('F j, Y g:i A');
        $this->sendEmail(
            $rfqSupplier->supplier_email,
            "Request for Quotation {$rfq->rfq_no} — ".$this->preferenceValue('agency_name', 'DOST Caraga'),
            implode("\n", array_filter([
                'Good day, '.($rfqSupplier->supplier_name ?: 'Supplier').'.',
                'We invite you to submit a quotation'.($rfq->purpose ? " for: {$rfq->purpose}" : '.'),
                $due ? "Please reply by {$due} (Philippine time), 7 calendar days from today." : null,
                'Open the link to see the items and specifications, enter your unit prices, and upload your signed quotation.',
            ])),
            $url,
            'Open the Request for Quotation',
        );

        return $url;
    }

    /** Sends one canvassed supplier the RFQ: starts its 7-day reply window and issues its portal link. */
    private function sendToSupplier(RfqSupplier $rfqSupplier): string
    {
        $now = now();
        $rfqSupplier->forceFill(['status' => 'Sent', 'sent_at' => $now, 'reply_due_at' => $now->copy()->addDays($this->replyWindowDays)])->save();

        return $this->issueRfqPortalLink($rfqSupplier->fresh('rfq'));
    }

    /**
     * Records a supplier's quotation — through the portal, or typed in by staff from a hand-delivered
     * one. Either way the signed quotation itself must be attached.
     *
     * @param  array<int, array{rfq_item_id: int|string, unit_price: float|int|string}>  $items
     */
    private function storeQuote(RfqSupplier $rfqSupplier, array $items, UploadedFile $signedQuotation, string $via): void
    {
        $rfq = $rfqSupplier->rfq;
        $rfqItemIds = $rfq->items()->pluck('id')->map(fn ($id) => (int) $id)->all();
        $given = collect($items)->pluck('rfq_item_id')->map(fn ($id) => (int) $id);
        abort_unless($given->diff($rfqItemIds)->isEmpty(), 422, 'Every quoted item must belong to this RFQ.');
        abort_unless(collect($rfqItemIds)->diff($given)->isEmpty(), 422, 'Quote a unit price for every item on the RFQ.');

        $path = $signedQuotation->store($this->quotationFolder.'/'.$rfq->id, 'local');

        DB::transaction(function () use ($items, $rfqSupplier, $signedQuotation, $path, $via): void {
            foreach ($items as $item) {
                $rfqItem = RfqItem::find($item['rfq_item_id']);
                RfqQuoteItem::updateOrCreate(
                    ['rfq_supplier_id' => $rfqSupplier->id, 'rfq_item_id' => $rfqItem->id],
                    ['unit_price' => $item['unit_price'], 'total_price' => (float) $item['unit_price'] * (float) $rfqItem->quantity],
                );
            }
            $rfqSupplier->forceFill([
                'status' => 'Replied',
                'replied_at' => now(),
                'quotation_path' => $path,
                'quotation_original_name' => mb_substr($signedQuotation->getClientOriginalName(), 0, 255),
                'quote_submitted_via' => $via,
            ])->save();
        });

        foreach ($this->canvassWatchers($rfq) as $watcher) {
            $this->notify($watcher, 'rfq_quote_received', 'Quotation received',
                "{$rfqSupplier->supplier_name} sent its signed quotation for {$rfq->rfq_no}".($via === 'Portal' ? ' through the Supplier Portal.' : '.'),
                "/rfq/{$rfq->id}", ['rfqId' => $rfq->id]);
        }

        $this->refreshCanvassState($rfq);
    }

    /**
     * Flowchart: "Cancel sent RFQ of Non-responding Supplier". The slot it leaves is filled by
     * "Choose n of supplier". $auto is the 7-day sweep; otherwise a staff member did it early.
     */
    private function cancelSupplierRfq(RfqSupplier $rfqSupplier, string $reason, bool $auto): void
    {
        $rfqSupplier->forceFill([
            'status' => 'TimedOut',
            'portal_token_hash' => null,
            'portal_token_expires_at' => null,
            'remarks' => $reason,
        ])->save();

        $rfq = $rfqSupplier->rfq;
        $this->sendEmail(
            $rfqSupplier->supplier_email,
            "Request for Quotation {$rfq->rfq_no} cancelled",
            'Good day, '.($rfqSupplier->supplier_name ?: 'Supplier').".\nThe Request for Quotation {$rfq->rfq_no} sent to you has been cancelled"
                .($auto ? ' because no quotation was received within 7 calendar days.' : '.')
                ."\nThank you for your time.",
        );

        foreach ($this->canvassWatchers($rfq) as $watcher) {
            $this->notify($watcher, 'rfq_supplier_cancelled', 'Choose a replacement supplier',
                "{$rfqSupplier->supplier_name} did not reply to {$rfq->rfq_no}, so its RFQ was cancelled. Choose a replacement supplier to keep 3 in the canvass.",
                "/rfq/{$rfq->id}", ['rfqId' => $rfq->id]);
        }

        $this->refreshCanvassState($rfq);
    }

    /**
     * Moves an Equipment RFQ into TWG evaluation once every canvassed supplier has replied or been
     * cancelled (and at least one replied) — and back to canvassing when replacements go out.
     */
    private function refreshCanvassState(Rfq $rfq): void
    {
        $rfq->refresh();
        if ($rfq->procurement_category !== 'Equipment' || $rfq->abstractOfCanvas()->exists()) {
            return;
        }

        $awaiting = $rfq->suppliers()->whereIn('status', ['Pending', 'Sent'])->exists();
        $replied = $rfq->suppliers()->where('status', 'Replied')->exists();

        if ($rfq->status === 'Canvassing' && ! $awaiting && $replied) {
            $rfq->forceFill(['status' => 'TWG Evaluation', 'stage' => 'TWG Evaluation'])->save();
            $this->notify($this->designatedTwgLead(), 'rfq_twg_evaluation', 'Equipment awaiting TWG evaluation',
                "All quotations for {$rfq->rfq_no} are in. Evaluate the specifications, then check each equipment item with each supplier.",
                "/rfq/{$rfq->id}", ['rfqId' => $rfq->id]);
        } elseif ($rfq->status === 'TWG Evaluation' && $awaiting) {
            $rfq->forceFill(['status' => 'Canvassing', 'stage' => 'Canvassing'])->save();
        }
    }

    /** Who follows a canvass: whoever prepared the RFQ and the designated Supply Officer. */
    private function canvassWatchers(Rfq $rfq): array
    {
        return collect([$rfq->creator, $this->designatedSupplyOfficer()])
            ->filter(fn ($user) => $user instanceof User)
            ->unique('id')
            ->values()
            ->all();
    }
}
