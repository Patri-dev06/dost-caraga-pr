<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\Rfq;
use App\Models\SystemPreference;
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

    /** Generates a PO from a winning (Approved) RFQ, copying supplier and item data over. */
    public function generateFromRfq(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('po');
        abort_unless($rfq->status === 'Approved', 422, 'A Purchase Order can only be generated from an approved RFQ.');
        abort_if($rfq->purchaseOrders()->exists(), 422, 'A Purchase Order has already been generated from this RFQ.');

        $rfq->loadMissing(['purchaseRequest', 'items']);

        $po = DB::transaction(function () use ($rfq, $request): PurchaseOrder {
            $po = PurchaseOrder::create([
                'po_no' => $this->nextPoNo(),
                'purchase_request_id' => $rfq->purchase_request_id,
                'rfq_id' => $rfq->id,
                'supplier_name' => $rfq->supplier_name,
                'supplier_address' => $rfq->supplier_address,
                'supplier_contact_no' => $rfq->supplier_contact_no,
                'supplier_tin' => $rfq->supplier_tin,
                'place_of_delivery' => $rfq->place_of_delivery,
                'mode_of_procurement' => $rfq->purchaseRequest?->mode_of_procurement,
                'total_amount' => $rfq->items->sum(fn ($item) => (float) $item->quantity * (float) ($item->unit_price ?? 0)),
                'created_by' => $request->user()->id,
            ]);

            $po->items()->createMany($rfq->items->map(fn ($item, int $index): array => [
                'rfq_item_id' => $item->id,
                'item_no' => $item->item_no ?: $index + 1,
                'description' => $item->description,
                'uom' => $item->uom,
                'quantity' => $item->quantity,
                'unit_cost' => $item->unit_price ?? 0,
                'total_cost' => $item->quantity * ($item->unit_price ?? 0),
            ])->values()->all());

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
        abort_if(! in_array($purchaseOrder->status, ['Draft', 'Returned'], true), 422, 'Only draft or returned Purchase Orders may be edited.');

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

        $purchaseOrder->forceFill([
            'status' => 'For Recommendation',
            'stage' => $this->stagePreference('po_recommending_stage', 'Division Chief Recommendation'),
            'submitted_at' => now(),
        ])->save();

        $this->recordAction($request, $purchaseOrder, 'Requester', 'Submitted PO', 'Initial submission.');

        return response()->json(['message' => 'Purchase Order submitted for recommendation.', 'data' => $this->format($purchaseOrder->fresh())]);
    }

    public function recommend(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->guardModule('approvals');

        $purchaseOrder->forceFill([
            'status' => 'For Approval',
            'stage' => $this->stagePreference('po_rd_stage', 'Director Approval'),
        ])->save();
        $this->recordAction($request, $purchaseOrder, 'Recommender', 'Recommended', $request->input('remarks'));

        return response()->json(['message' => 'Purchase Order recommended.', 'data' => $this->format($purchaseOrder->fresh())]);
    }

    public function approve(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->guardModule('approvals');

        $purchaseOrder->forceFill(['status' => 'Approved', 'stage' => 'Approved'])->save();
        $this->recordAction($request, $purchaseOrder, 'Approver', 'Approved', $request->input('remarks'));

        return response()->json(['message' => 'Purchase Order approved.', 'data' => $this->format($purchaseOrder->fresh())]);
    }

    public function reject(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->guardModule('approvals');

        $data = $request->validate(['reason' => ['required', 'string']]);
        $purchaseOrder->forceFill(['status' => 'Rejected', 'stage' => 'Rejected'])->save();
        $this->recordAction($request, $purchaseOrder, 'Approver', 'Rejected', $data['reason']);

        return response()->json(['message' => 'Purchase Order rejected.', 'data' => $this->format($purchaseOrder->fresh())]);
    }

    /** Reads a SystemPreference key directly (no auto-seed), matching RfqController's pattern. */
    private function stagePreference(string $key, string $fallback): string
    {
        return SystemPreference::where('key', $key)->first()?->value['value'] ?? $fallback;
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
