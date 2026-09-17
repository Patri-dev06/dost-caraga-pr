<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\Rfq;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchaseOrderController extends Controller
{
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

        return response()->json([
            'data' => $query->latest('id')->get()->map(fn (PurchaseOrder $po) => $this->format($po)),
        ]);
    }

    /** Generates a Draft PO from the RFQ's BAC-approved Abstract of Canvas, copying the winning supplier's quote. */
    public function generateFromRfq(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('po');

        $aoc = $rfq->abstractOfCanvas;
        abort_unless($aoc !== null && $aoc->status === 'Approved', 422, 'A Purchase Order can only be generated once the Abstract of Canvas is BAC-approved.');
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

    /** Records whether the winning supplier delivered or waived, once the PO is fully approved. */
    public function deliver(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->guardModule('po');
        abort_unless($purchaseOrder->status === 'Approved', 422, 'Only an approved Purchase Order can record a delivery outcome.');

        $data = $request->validate([
            'waived' => ['required', 'boolean'],
            'reason' => ['required_if:waived,true', 'nullable', 'string'],
        ]);

        if (! $data['waived']) {
            $this->recordAction($request, $purchaseOrder, 'Supply', 'Delivery Accepted', null);

            return response()->json(['message' => 'Delivery accepted.', 'data' => $this->format($purchaseOrder->fresh())]);
        }

        $purchaseOrder->forceFill([
            'status' => 'Delivery Waived',
            'stage' => 'Delivery Waived',
            'delivery_waived' => true,
            'delivery_waived_at' => now(),
            'delivery_waived_reason' => $data['reason'],
        ])->save();
        $this->recordAction($request, $purchaseOrder, 'Supply', 'Delivery Waived', $data['reason']);

        $requester = $purchaseOrder->purchaseRequest?->requester;
        if ($requester) {
            $this->notify($requester, 'po_delivery_waived', 'Supplier waived delivery',
                "{$purchaseOrder->po_no}'s supplier waived delivery. Start a new RFQ canvass to re-procure if the need still stands.",
                '/rfq', ['poId' => $purchaseOrder->id]);
        }

        return response()->json(['message' => 'Delivery waiver recorded.', 'data' => $this->format($purchaseOrder->fresh())]);
    }

    private function format(PurchaseOrder $po): array
    {
        $po->loadMissing(['purchaseRequest', 'rfq', 'items', 'approvalActions']);

        return [
            'id' => $po->id,
            'po_no' => $po->po_no,
            'purchase_request_id' => $po->purchase_request_id,
            'pr_no' => $po->purchaseRequest?->pr_no,
            'rfq_id' => $po->rfq_id,
            'rfq_no' => $po->rfq?->rfq_no,
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
