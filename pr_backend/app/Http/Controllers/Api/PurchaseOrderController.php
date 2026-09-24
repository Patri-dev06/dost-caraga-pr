<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\CancelsPurchaseRequests;
use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\Rfq;
use App\Models\User;
use App\Support\PortalToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The flowchart's yellow lane: Create PO -> Budget (obligation) -> Accounting -> RD final approval
 * -> Generate PO with complete digital signature -> Forward signed PO to Supplier Portal (notify the
 * supplier and the end-user of the winning bidder) -> Does supplier waive to deliver?
 */
class PurchaseOrderController extends Controller
{
    use CancelsPurchaseRequests;
    use HasProcurementHelpers;

    public function index(Request $request): JsonResponse
    {
        $this->guardModule('po');

        $query = PurchaseOrder::with(['purchaseRequest', 'rfq', 'items', 'approvalActions']);

        if ($request->query('purchase_request_id')) {
            $query->where('purchase_request_id', $request->query('purchase_request_id'));
        }

        if ($request->query('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        // Never the whole table: capped, real pagination (defaults to 20/page).
        $page = $query->latest('id')->paginate(min((int) $request->query('per_page', 20), 100));

        return response()->json($page->through(fn (PurchaseOrder $po) => $this->format($po)));
    }

    /** Generates a Draft PO once Supply has noted the lowest bidder on the BAC-approved AOC, copying that supplier's quote. */
    public function generateFromRfq(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('po');

        $aoc = $rfq->abstractOfCanvas;
        abort_unless($aoc !== null && $aoc->status === 'Lowest Bidder Noted', 422, 'A Purchase Order can only be generated once the BAC has approved the Abstract of Canvas and Supply has noted the lowest bidder.');
        abort_if($rfq->purchaseRequest?->status === 'Cancelled', 422, 'This Purchase Request was cancelled.');
        abort_if($rfq->purchaseOrders()->exists(), 422, 'A Purchase Order has already been generated from this RFQ.');

        $winner = $aoc->winningSupplier()->with('quoteItems.rfqItem')->first();
        abort_if($winner === null, 422, 'No winning supplier is recorded on this Abstract of Canvas.');

        $rfq->loadMissing('purchaseRequest');

        $po = DB::transaction(function () use ($rfq, $winner, $request): PurchaseOrder {
            $po = PurchaseOrder::create([
                'po_no' => $this->nextPoNo(),
                'purchase_request_id' => $rfq->purchase_request_id,
                'rfq_id' => $rfq->id,
                'supplier_name' => $winner->supplier_name,
                'supplier_address' => $winner->supplier_address,
                'supplier_contact_no' => $winner->supplier_contact_no,
                'supplier_tin' => $winner->supplier_tin,
                'supplier_email' => $winner->supplier_email,
                'place_of_delivery' => $rfq->place_of_delivery,
                'mode_of_procurement' => $rfq->purchaseRequest?->mode_of_procurement,
                'total_amount' => $winner->quoteItems->sum(fn ($qi) => (float) $qi->total_price),
                'status' => 'Draft',
                'stage' => 'Draft',
                'created_by' => $request->user()->id,
            ]);

            $po->items()->createMany($winner->quoteItems->values()->map(fn ($qi, int $index): array => [
                'rfq_item_id' => $qi->rfq_item_id,
                'item_no' => $qi->rfqItem?->item_no ?: $index + 1,
                'description' => $qi->rfqItem?->description,
                'uom' => $qi->rfqItem?->uom,
                'quantity' => $qi->rfqItem?->quantity ?? 0,
                'unit_cost' => $qi->unit_price ?? 0,
                'total_cost' => $qi->total_price ?? 0,
            ])->all());

            return $po;
        });

        $this->audit($request, 'PO', 'Generated PO', $po->po_no);

        return response()->json(['data' => $this->format($po->fresh())], 201);
    }

    public function show(PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->guardModule('po');

        return response()->json(['data' => $this->format($purchaseOrder)]);
    }

    public function update(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->guardModule('po');
        abort_unless($purchaseOrder->status === 'Draft', 422, 'Only a Draft Purchase Order may be edited.');

        $data = $request->validate([
            'po_date' => ['nullable', 'string', 'max:255'],
            'delivery_date' => ['nullable', 'string', 'max:255'],
            'place_of_delivery' => ['nullable', 'string', 'max:255'],
            'terms_and_conditions' => ['nullable', 'string'],
            'items' => ['sometimes', 'array', 'min:1'],
            'items.*.rfq_item_id' => ['nullable', 'exists:rfq_items,id'],
            'items.*.item_no' => ['nullable', 'integer'],
            'items.*.description' => ['nullable', 'string'],
            'items.*.uom' => ['nullable', 'string', 'max:30'],
            'items.*.quantity' => ['required_with:items', 'numeric', 'min:0'],
            'items.*.unit_cost' => ['required_with:items', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($data, $purchaseOrder): void {
            $items = $data['items'] ?? null;
            unset($data['items']);
            $purchaseOrder->fill($data)->save();

            if ($items !== null) {
                $purchaseOrder->items()->delete();
                $purchaseOrder->items()->createMany(collect($items)->values()->map(fn (array $item, int $index): array => [
                    'rfq_item_id' => $item['rfq_item_id'] ?? null,
                    'item_no' => $item['item_no'] ?? $index + 1,
                    'description' => $item['description'] ?? null,
                    'uom' => $item['uom'] ?? null,
                    'quantity' => $item['quantity'],
                    'unit_cost' => $item['unit_cost'],
                    'total_cost' => (float) $item['quantity'] * (float) $item['unit_cost'],
                ])->all());
                $purchaseOrder->forceFill([
                    'total_amount' => $purchaseOrder->items()->get()->sum(fn ($item) => (float) $item->total_cost),
                ])->save();
            }
        });

        $this->audit($request, 'PO', 'Updated PO', $purchaseOrder->po_no);

        return response()->json(['data' => $this->format($purchaseOrder->fresh())]);
    }

    public function submit(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->guardModule('po');
        abort_unless($purchaseOrder->status === 'Draft', 422, 'This Purchase Order has already been submitted.');

        $purchaseOrder->forceFill([
            'status' => 'Pending Budget Obligation',
            'stage' => 'Pending Budget Obligation',
            'submitted_at' => now(),
        ])->save();
        $this->recordAction($request, $purchaseOrder, 'Requester', 'Submitted PO', null);

        $officer = $this->designatedBudgetOfficer();
        if ($officer) {
            $this->notify($officer, 'po_submitted', 'Purchase Order awaiting budget obligation',
                "{$purchaseOrder->po_no} is awaiting your action.", "/po/{$purchaseOrder->id}", ['poId' => $purchaseOrder->id]);
        }

        return response()->json(['message' => 'Purchase Order submitted.', 'data' => $this->format($purchaseOrder->fresh())]);
    }

    // --- 3-stage approval chain: Budget Obligation -> Accounting -> Regional Director ---

    public function obligate(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        return $this->advancePo($request, $purchaseOrder, 'obligate');
    }

    public function account(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        return $this->advancePo($request, $purchaseOrder, 'account');
    }

    public function finalApprove(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        return $this->advancePo($request, $purchaseOrder, 'final_approve');
    }

    private function advancePo(Request $request, PurchaseOrder $po, string $step): JsonResponse
    {
        $this->guardModule('approvals');

        $steps = [
            'obligate' => ['from' => 'Pending Budget Obligation', 'to' => 'Pending Accounting', 'designated' => fn () => $this->designatedBudgetOfficer(), 'label' => 'Budget Officer', 'column' => 'budget_officer'],
            'account' => ['from' => 'Pending Accounting', 'to' => 'Pending RD Approval', 'designated' => fn () => $this->designatedAccountingOfficer(), 'label' => 'Accounting Officer', 'column' => 'accounting_officer'],
            'final_approve' => ['from' => 'Pending RD Approval', 'to' => 'Approved', 'designated' => fn () => $this->designatedRegionalDirector(), 'label' => 'Regional Director', 'column' => 'approved_by'],
        ][$step];

        abort_unless($po->status === $steps['from'], 422, "This Purchase Order is not awaiting the {$steps['label']} action.");

        $user = $request->user();
        $designated = $steps['designated']();
        $ok = $user?->tier === 'superadmin' || ($designated !== null && $designated->id === $user?->id);
        abort_unless($ok, 403, "You are not the designated {$steps['label']}.");
        $this->requireSignature($user);

        $column = $steps['column'];
        $po->forceFill([
            'status' => $steps['to'],
            'stage' => $steps['to'],
            "{$column}_id" => $user->id,
            "{$column}_name" => $user->name,
            "{$column}_signed_at" => now(),
        ])->save();

        $this->recordAction($request, $po, $steps['label'], 'Signed', $request->input('remarks'));

        $nextDesignated = match ($steps['to']) {
            'Pending Accounting' => $this->designatedAccountingOfficer(),
            'Pending RD Approval' => $this->designatedRegionalDirector(),
            default => null,
        };
        if ($nextDesignated) {
            $this->notify($nextDesignated, 'po_approval', 'Purchase Order awaiting your action',
                "{$po->po_no} is awaiting your action.", "/po/{$po->id}", ['poId' => $po->id]);
        }

        if ($steps['to'] === 'Approved') {
            // "Generate PO (with complete digital signature) -> Forward signed PO to Supplier Portal".
            $link = $this->forwardToSupplier($po->fresh());

            return response()->json([
                'message' => 'Purchase Order approved and forwarded to the supplier through the Supplier Portal.',
                'portal_link' => $link,
                'data' => $this->format($po->fresh()),
            ]);
        }

        return response()->json(['message' => "Purchase Order signed by {$steps['label']}.", 'data' => $this->format($po->fresh())]);
    }

    /** Rejects a PO at whichever stage it's currently pending — only that stage's designated signatory may. */
    public function reject(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->guardModule('approvals');
        abort_unless(in_array($purchaseOrder->status, ['Pending Budget Obligation', 'Pending Accounting', 'Pending RD Approval'], true),
            422, 'This Purchase Order is not awaiting action.');

        $designated = match ($purchaseOrder->status) {
            'Pending Budget Obligation' => $this->designatedBudgetOfficer(),
            'Pending Accounting' => $this->designatedAccountingOfficer(),
            'Pending RD Approval' => $this->designatedRegionalDirector(),
        };
        $user = $request->user();
        $ok = $user?->tier === 'superadmin' || ($designated !== null && $designated->id === $user?->id);
        abort_unless($ok, 403, 'You are not the designated signatory for this Purchase Order stage.');

        $data = $request->validate(['reason' => ['required', 'string']]);
        $purchaseOrder->forceFill(['status' => 'Rejected', 'stage' => 'Rejected'])->save();
        $this->recordAction($request, $purchaseOrder, 'Approver', 'Rejected', $data['reason']);

        return response()->json(['message' => 'Purchase Order rejected.', 'data' => $this->format($purchaseOrder->fresh())]);
    }

    /** Re-issues the supplier's PO portal link (the old one stops working) and emails it again. */
    public function forward(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->guardModule('po');
        abort_unless(in_array($purchaseOrder->status, ['Approved', 'Forwarded to Supplier'], true), 422, 'Only a fully signed Purchase Order that the supplier has not answered can be forwarded.');

        $link = $this->forwardToSupplier($purchaseOrder);
        $this->audit($request, 'PO', 'Forwarded PO to supplier', $purchaseOrder->po_no);

        return response()->json(['message' => 'Purchase Order forwarded to the supplier.', 'portal_link' => $link, 'data' => $this->format($purchaseOrder->fresh())]);
    }

    /**
     * Flowchart: "Does supplier waive to deliver?", recorded by Supply on the supplier's behalf (the
     * supplier can also answer on the portal). Waived -> Cancel PR -> Notify end-user to Re-PR.
     */
    public function deliver(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->guardModule('po');
        abort_unless(in_array($purchaseOrder->status, ['Approved', 'Forwarded to Supplier'], true), 422, 'Only a fully signed Purchase Order awaiting the supplier\'s answer can record a delivery outcome.');

        $data = $request->validate([
            'waived' => ['required', 'boolean'],
            'reason' => ['required_if:waived,true', 'nullable', 'string'],
        ]);

        $this->recordDeliveryAnswer($request, $purchaseOrder, (bool) $data['waived'], $data['reason'] ?? null, $request->user()->name);

        return response()->json([
            'message' => $data['waived'] ? 'Delivery waiver recorded. The Purchase Request was cancelled and the end-user asked to Re-PR.' : 'Delivery accepted.',
            'data' => $this->format($purchaseOrder->fresh()),
        ]);
    }

    /** Shared with the Supplier Portal: the supplier's answer to "Does supplier waive to deliver?". */
    public function recordDeliveryAnswer(Request $request, PurchaseOrder $po, bool $waived, ?string $reason, string $respondedBy): void
    {
        if (! $waived) {
            $po->forceFill([
                'status' => 'Delivery Accepted',
                'stage' => 'Delivery Accepted',
                'delivery_accepted_at' => now(),
                'delivery_responded_by' => $respondedBy,
            ])->save();
            $this->recordActionAs($request, $po, 'Supply', 'Delivery Accepted', "Answered by {$respondedBy}");

            foreach ($this->poWatchers($po) as $watcher) {
                $this->notify($watcher, 'po_delivery_accepted', 'Supplier will deliver',
                    "{$po->supplier_name} acknowledged {$po->po_no} and will deliver.", "/po/{$po->id}", ['poId' => $po->id]);
            }

            return;
        }

        $po->forceFill([
            'status' => 'Delivery Waived',
            'stage' => 'Delivery Waived',
            'delivery_waived' => true,
            'delivery_waived_at' => now(),
            'delivery_waived_reason' => $reason,
            'delivery_responded_by' => $respondedBy,
        ])->save();
        $this->recordActionAs($request, $po, 'Supply', 'Delivery Waived', $reason);

        $purchaseRequest = $po->purchaseRequest;
        if ($purchaseRequest) {
            $this->cancelPurchaseRequest($request, $purchaseRequest, "The winning supplier ({$po->supplier_name}) waived delivery of {$po->po_no}: {$reason}", 'PO');
        }
    }

    /**
     * Issues the PO's portal link, emails it to the winning supplier, and tells the end-user who won.
     *
     * @return array{url: string, emailed: bool}
     */
    private function forwardToSupplier(PurchaseOrder $po): array
    {
        $token = PortalToken::issue();
        $po->forceFill([
            'status' => 'Forwarded to Supplier',
            'stage' => 'Forwarded to Supplier',
            'forwarded_to_supplier_at' => now(),
            'portal_token_hash' => $token['hash'],
        ])->save();

        $url = $this->frontendUrl('/portal/po/'.$token['plain']);
        $email = $po->supplier_email ?: $po->rfq?->abstractOfCanvas?->winningSupplier?->supplier_email;
        $this->sendEmail(
            $email,
            "Purchase Order {$po->po_no} — ".$this->preferenceValue('agency_name', 'DOST Caraga'),
            implode("\n", [
                'Good day, '.($po->supplier_name ?: 'Supplier').'.',
                "Your quotation won. Purchase Order {$po->po_no} for ₱".number_format((float) $po->total_amount, 2).' is fully signed.',
                'Open the link to view and download the signed Purchase Order, then confirm that you will deliver — or tell us if you waive delivery.',
            ]),
            $url,
            'Open the Purchase Order',
        );

        $requester = $po->purchaseRequest?->requester;
        $this->notify($requester, 'po_forwarded', 'Winning bidder: Purchase Order sent to the supplier',
            "{$po->po_no} ({$po->purchaseRequest?->pr_no}) was awarded to {$po->supplier_name} for ₱".number_format((float) $po->total_amount, 2).' and forwarded to the supplier.',
            "/purchase-requests/{$po->purchase_request_id}", ['poId' => $po->id]);
        foreach ($this->poWatchers($po) as $watcher) {
            if ($watcher->id !== $requester?->id) {
                $this->notify($watcher, 'po_forwarded', 'Purchase Order forwarded to the supplier',
                    "{$po->po_no} is fully signed and was sent to {$po->supplier_name} through the Supplier Portal.", "/po/{$po->id}", ['poId' => $po->id]);
            }
        }

        return ['url' => $url, 'emailed' => ! empty($email)];
    }

    /** The person who prepared the PO and the Supply Officer. */
    private function poWatchers(PurchaseOrder $po): array
    {
        return collect([$po->creator, $this->designatedSupplyOfficer()])->filter(fn ($u) => $u instanceof User)->unique('id')->values()->all();
    }

    /** Staff answer as Supply; a supplier answering on the portal has no account, so the trail says Supplier. */
    private function recordActionAs(Request $request, PurchaseOrder $po, string $role, string $action, ?string $remarks): void
    {
        $this->recordAction($request, $po, $request->user() ? $role : 'Supplier', $action, $remarks);
    }

    private function format(PurchaseOrder $po): array
    {
        $po->loadMissing(['purchaseRequest', 'rfq', 'items', 'approvalActions', 'creator.roles', 'budgetOfficer', 'accountingOfficer', 'approvedBy']);

        return [
            'id' => $po->id,
            'po_no' => $po->po_no,
            'purchase_request_id' => $po->purchase_request_id,
            'pr_no' => $po->purchaseRequest?->pr_no,
            'rfq_id' => $po->rfq_id,
            'rfq_no' => $po->rfq?->rfq_no,
            'prepared_by' => $this->preparedBy($po->creator),
            'supplier_name' => $po->supplier_name,
            'supplier_address' => $po->supplier_address,
            'supplier_contact_no' => $po->supplier_contact_no,
            'supplier_tin' => $po->supplier_tin,
            'po_date' => $po->po_date,
            'delivery_date' => $po->delivery_date,
            'place_of_delivery' => $po->place_of_delivery,
            'mode_of_procurement' => $po->mode_of_procurement,
            'total_amount' => $po->total_amount,
            'terms_and_conditions' => $po->terms_and_conditions,
            'budget_officer_name' => $po->budget_officer_name,
            'budget_officer_signed_at' => $po->budget_officer_signed_at?->toISOString(),
            'accounting_officer_name' => $po->accounting_officer_name,
            'accounting_officer_signed_at' => $po->accounting_officer_signed_at?->toISOString(),
            'approved_by_name' => $po->approved_by_name,
            'approved_by_signed_at' => $po->approved_by_signed_at?->toISOString(),
            // "Generate PO (with complete digital signature)": the e-signature images of each signer.
            'budget_officer_signature' => $po->budget_officer_signed_at ? $po->budgetOfficer?->signature : null,
            'accounting_officer_signature' => $po->accounting_officer_signed_at ? $po->accountingOfficer?->signature : null,
            'approved_by_signature' => $po->approved_by_signed_at ? $po->approvedBy?->signature : null,
            'supplier_email' => $po->supplier_email,
            'forwarded_to_supplier_at' => $po->forwarded_to_supplier_at?->toISOString(),
            'portal_link_active' => $po->portal_token_hash !== null,
            'delivery_accepted_at' => $po->delivery_accepted_at?->toISOString(),
            'delivery_responded_by' => $po->delivery_responded_by,
            'delivery_waived' => $po->delivery_waived,
            'delivery_waived_at' => $po->delivery_waived_at?->toISOString(),
            'delivery_waived_reason' => $po->delivery_waived_reason,
            'status' => $po->status,
            'stage' => $po->stage,
            'date_submitted' => $po->submitted_at?->toDateString(),
            'items' => $po->items,
            'approval_trail' => $po->approvalActions,
            'created_at' => $po->created_at?->toISOString(),
        ];
    }

    private function nextPoNo(): string
    {
        $year = now()->year;
        $lastNo = PurchaseOrder::where('po_no', 'like', "PO-{$year}-%")
            ->orderByRaw('CAST(SUBSTRING(po_no FROM \'[0-9]+$\') AS INTEGER) DESC')
            ->value('po_no');
        $lastSeq = $lastNo ? (int) preg_replace('/\D/', '', substr((string) $lastNo, strlen("PO-{$year}-"))) : 0;

        return sprintf('PO-%d-%04d', $year, $lastSeq + 1);
    }
}
