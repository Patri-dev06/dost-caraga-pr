<?php

namespace App\Services;

use App\Models\PurchaseRequest;
use Carbon\CarbonInterface;

/**
 * Where a Purchase Request stands in the whole procurement flow, step by step — from submission
 * through RFQ, AOC and PO to delivery, inspection, issuance and payment — so the requester (and
 * anyone following it) sees what is done, what is next and who it is waiting on, and which steps
 * are still missing. The last four steps come from the Supply team's Monitoring Sheet entries.
 */
final class PrProgress
{
    /** What PrProgress::steps() reads, eager-loaded for one PR or a whole page. */
    public const RELATIONS = [
        'approvalActions.user', 'recommendingOfficer', 'monitoringEntry', 'supportingDocuments:id,purchase_request_id,type',
        'rfqs.suppliers', 'rfqs.abstractOfCanvas', 'rfqs.purchaseOrders',
    ];

    /**
     * @return array{steps: list<array<string, mixed>>, done: int, total: int, stopped: ?string, next: ?array<string, mixed>}
     */
    public static function for(PurchaseRequest $pr): array
    {
        $pr->loadMissing(self::RELATIONS);

        $rfq = $pr->rfqs->where('status', '!=', 'Cancelled')->sortByDesc('id')->first();
        $aoc = $rfq?->abstractOfCanvas;
        // A waived PO's items move to a Re-PR, so the remaining suppliers alone decide these steps.
        $pos = $rfq?->purchaseOrders->whereNotIn('status', ['Cancelled', 'Delivery Waived'])->sortBy('id')->values() ?? collect();
        $manual = $pr->monitoringEntry?->values ?? [];
        $action = fn (string $name) => $pr->approvalActions->where('action', $name)->sortByDesc('id')->first();
        $iso = fn (?CarbonInterface $at) => $at?->toISOString();
        $allPosHave = fn (string $field): bool => $pos->isNotEmpty() && $pos->every(fn ($po) => $po->{$field} !== null);
        $latestPoDate = fn (string $field): ?CarbonInterface => $pos->pluck($field)->filter()->max();

        $active = $rfq?->suppliers->whereNotIn('status', ['TimedOut', 'Replaced', 'Failed TWG']) ?? collect();
        $replied = $active->where('status', 'Replied')->count();
        $sentAt = $rfq?->suppliers->pluck('sent_at')->filter()->min();
        $recommended = $action('Recommended');
        $approved = $action('Approved');
        // Supply may upload the signed PR for the RD: say so rather than naming Supply as the approver.
        $approvedBy = preg_match('/^Signed copy uploaded by .+? for the Regional Director\./', (string) $approved?->remarks, $m)
            ? rtrim($m[0], '.')
            : $approved?->user?->name;

        $steps = [
            ['submitted', 'PR', 'Submitted', 'You', $pr->submitted_at !== null && ! in_array($pr->status, ['Draft', 'Returned'], true),
                $iso($pr->submitted_at), $pr->status === 'Returned'
                    ? 'Returned — fix what the checks flagged, then submit it again.'
                    : ($pr->supportingDocuments->isNotEmpty() ? 'With '.$pr->supportingDocuments->pluck('type')->implode(' and ').' attached' : 'Complete the form and submit it.')],
            ['recommended', 'PR', 'Recommended', $pr->recommendingOfficer?->name ?? 'Recommending officer', $recommended !== null, $iso($recommended?->created_at), $recommended?->user?->name],
            ['approved', 'PR', 'Approved by the Regional Director', 'Regional Director', $approved !== null || $pr->status === 'Approved', $iso($approved?->created_at), $approvedBy],
            ['rfq_generated', 'RFQ', 'RFQ generated', 'Supply Unit', $rfq !== null, $iso($rfq?->created_at), $rfq?->rfq_no],
            ['rfq_signed', 'RFQ', 'RFQ signed (Supply Officer, BAC)', 'Supply Officer / BAC Chairman', $rfq?->bac_signed_at !== null, $iso($rfq?->bac_signed_at), $rfq?->bac_signed_name],
            ['rfq_sent', 'RFQ', 'RFQ delivered to 3 suppliers', 'Supply Unit', $sentAt !== null, $iso($sentAt), $rfq ? $active->count().' supplier(s) canvassed' : null],
            ['quotations', 'RFQ', 'Signed quotations received', 'Suppliers', $aoc !== null || ($active->count() >= 3 && $replied >= $active->count()),
                null, $rfq && $sentAt ? "{$replied} of ".max(3, $active->count()).' received' : null],
            ['aoc_generated', 'AOC', 'Abstract of Canvass prepared', 'Supply Unit', $aoc !== null, $iso($aoc?->created_at), null],
            ['bac_review', 'AOC', 'BAC review passed', 'BAC', $aoc?->bac_approved_at !== null || in_array($aoc?->status, ['For Supply Noting', 'Lowest Bidder Noted'], true), $iso($aoc?->bac_approved_at), null],
            ['bidder_noted', 'AOC', 'Item awards confirmed', 'Supply Officer', $aoc?->status === 'Lowest Bidder Noted', $iso($aoc?->supply_noted_at), $aoc?->supply_noted_name],
            ['po_generated', 'PO', 'Purchase Order(s) generated', 'Supply Unit', $pos->isNotEmpty(), $iso($latestPoDate('created_at')), $pos->map(fn ($po) => trim($po->po_no.' · '.$po->supplier_name, ' ·'))->implode('; ') ?: null],
            ['po_obligated', 'PO', 'All POs obligated by Budget', 'Budget Officer', $allPosHave('budget_officer_signed_at'), $iso($latestPoDate('budget_officer_signed_at')), null],
            ['po_accounting', 'PO', 'All POs signed by Accounting', 'Accounting Officer', $allPosHave('accounting_officer_signed_at'), $iso($latestPoDate('accounting_officer_signed_at')), null],
            ['po_approved', 'PO', 'All POs approved and released', 'Regional Director', $allPosHave('approved_by_signed_at'), $iso($latestPoDate('approved_by_signed_at')), $pos->pluck('approved_by_name')->filter()->unique()->implode(', ') ?: null],
            ['conforme', 'PO', 'All suppliers agreed to deliver', 'Suppliers (recorded by Supply)', $allPosHave('delivery_accepted_at'), $iso($latestPoDate('delivery_accepted_at')), null],
            ['delivered', 'Delivery', 'Delivered in full', 'Supplier', ! empty($manual['delivered_full_at']), $manual['delivered_full_at'] ?? null, null],
            ['inspected', 'Delivery', 'Inspected and accepted (IAR)', 'Inspection Committee', ! empty($manual['iar_no']) || ! empty($manual['acceptance']), $manual['inspection_in_at'] ?? null, $manual['iar_no'] ?? null],
            ['issued', 'Delivery', 'Issued to you', 'Supply Unit', ! empty($manual['issued_to_end_user_at']), $manual['issued_to_end_user_at'] ?? null, $manual['issuance_document'] ?? null],
            ['paid', 'Payment', 'Out for payment', 'Accounting', ! empty($manual['out_for_payment_at']), $manual['out_for_payment_at'] ?? null, null],
        ];

        $stopped = match ($pr->status) {
            'Cancelled' => 'Cancelled'.($pr->cancel_reason ? ': '.$pr->cancel_reason : '.'),
            'Rejected' => 'Rejected'.(($r = $action('Rejected')?->remarks) ? ': '.$r : '.'),
            default => null,
        };

        // Every step up to the last one reached counts as done (a later step implies the earlier ones);
        // the first step after that is the current one, and the rest are still missing.
        $reached = -1;
        foreach ($steps as $i => $step) {
            if ($step[4]) {
                $reached = $i;
            }
        }

        $out = [];
        foreach ($steps as $i => [$key, $phase, $label, $who, $isDone, $at, $detail]) {
            $status = match (true) {
                $i <= $reached => 'done',
                $stopped !== null => 'stopped',
                $i === $reached + 1 => 'current',
                default => 'pending',
            };
            $out[] = [
                'key' => $key, 'phase' => $phase, 'label' => $label, 'waiting_on' => $who,
                'status' => $status, 'at' => $status === 'done' ? $at : null, 'detail' => $detail,
            ];
        }

        $next = collect($out)->firstWhere('status', 'current');

        return [
            'steps' => $out,
            'done' => $reached + 1,
            'total' => count($out),
            'stopped' => $stopped,
            'next' => $next ? ['label' => $next['label'], 'waiting_on' => $next['waiting_on'], 'detail' => $next['detail']] : null,
        ];
    }
}
