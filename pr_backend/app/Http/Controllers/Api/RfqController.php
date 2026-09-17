<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Controller;
use App\Models\PurchaseRequest;
use App\Models\Rfq;
use App\Models\SystemPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RfqController extends Controller
{
    use HasProcurementHelpers;

    public function index(Request $request): JsonResponse
    {
        $this->guardModule('rfq');

        $query = Rfq::with(['purchaseRequest', 'items', 'approvalActions']);

        if ($request->query('purchase_request_id')) {
            $query->where('purchase_request_id', $request->query('purchase_request_id'));
        }

        if ($request->query('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        return response()->json([
            'data' => $query->latest('id')->get()->map(fn (Rfq $rfq) => $this->format($rfq)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->guardModule('rfq');

        $data = $request->validate([
            'purchase_request_id' => ['required', 'exists:purchase_requests,id'],
            'quotation_no' => ['nullable', 'string', 'max:255'],
            'rfq_date' => ['nullable', 'string', 'max:255'],
            'opening_date' => ['nullable', 'string', 'max:255'],
            'place_of_delivery' => ['nullable', 'string', 'max:255'],
            'estimated_budget' => ['nullable', 'numeric', 'min:0'],
            'bac_chairman' => ['nullable', 'string', 'max:255'],
            'bac_chairman_title' => ['nullable', 'string', 'max:255'],
            'purpose' => ['nullable', 'string'],
            'fund_source_snapshot' => ['nullable', 'string', 'max:255'],
            'supplier_name' => ['nullable', 'string', 'max:255'],
            'supplier_address' => ['nullable', 'string', 'max:255'],
            'supplier_by' => ['nullable', 'string', 'max:255'],
            'supplier_contact_no' => ['nullable', 'string', 'max:255'],
            'supplier_tin' => ['nullable', 'string', 'max:255'],
            'canvasser' => ['nullable', 'string', 'max:255'],
            'bac_action' => ['nullable', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.purchase_request_item_id' => ['nullable', 'exists:purchase_request_items,id'],
            'items.*.item_no' => ['nullable', 'integer'],
            'items.*.description' => ['nullable', 'string'],
            'items.*.uom' => ['nullable', 'string', 'max:30'],
            'items.*.quantity' => ['required', 'numeric', 'min:0'],
            'items.*.unit_abc' => ['nullable', 'numeric', 'min:0'],
            'items.*.total_abc' => ['nullable', 'numeric', 'min:0'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.total_price' => ['nullable', 'numeric', 'min:0'],
        ]);

        $purchaseRequest = PurchaseRequest::with('fundSource')->findOrFail($data['purchase_request_id']);
        abort_unless($purchaseRequest->status === 'Approved', 422, 'RFQs can only be generated from an approved Purchase Request.');

        $rfq = DB::transaction(function () use ($data, $purchaseRequest, $request): Rfq {
            $rfq = Rfq::create([
                'rfq_no' => $this->nextRfqNo(),
                'purchase_request_id' => $purchaseRequest->id,
                'quotation_no' => $data['quotation_no'] ?? null,
                'rfq_date' => $data['rfq_date'] ?? null,
                'opening_date' => $data['opening_date'] ?? null,
                'place_of_delivery' => $data['place_of_delivery'] ?? null,
                'estimated_budget' => $data['estimated_budget'] ?? collect($data['items'])->sum(fn ($item) => (float) ($item['total_abc'] ?? 0)),
                'bac_chairman' => $data['bac_chairman'] ?? null,
                'bac_chairman_title' => $data['bac_chairman_title'] ?? null,
                'purpose' => $data['purpose'] ?? $purchaseRequest->purpose,
                'fund_source_snapshot' => $data['fund_source_snapshot'] ?? $purchaseRequest->fundSource?->name,
                'supplier_name' => $data['supplier_name'] ?? null,
                'supplier_address' => $data['supplier_address'] ?? null,
                'supplier_by' => $data['supplier_by'] ?? null,
                'supplier_contact_no' => $data['supplier_contact_no'] ?? null,
                'supplier_tin' => $data['supplier_tin'] ?? null,
                'canvasser' => $data['canvasser'] ?? null,
                'bac_action' => $data['bac_action'] ?? null,
                'created_by' => $request->user()->id,
            ]);

            $rfq->items()->createMany($this->normalizedItems($data['items']));

            return $rfq;
        });

        $this->audit($request, 'RFQ', 'Created RFQ', $rfq->rfq_no);

        return response()->json(['data' => $this->format($rfq->fresh())], 201);
    }

    public function show(Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');

        return response()->json(['data' => $this->format($rfq)]);
    }

    public function update(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        abort_if(! in_array($rfq->status, ['Draft', 'Returned'], true), 422, 'Only draft or returned RFQs may be edited.');

        $data = $request->validate([
            'quotation_no' => ['nullable', 'string', 'max:255'],
            'rfq_date' => ['nullable', 'string', 'max:255'],
            'opening_date' => ['nullable', 'string', 'max:255'],
            'place_of_delivery' => ['nullable', 'string', 'max:255'],
            'estimated_budget' => ['nullable', 'numeric', 'min:0'],
            'bac_chairman' => ['nullable', 'string', 'max:255'],
            'bac_chairman_title' => ['nullable', 'string', 'max:255'],
            'purpose' => ['nullable', 'string'],
            'fund_source_snapshot' => ['nullable', 'string', 'max:255'],
            'supplier_name' => ['nullable', 'string', 'max:255'],
            'supplier_address' => ['nullable', 'string', 'max:255'],
            'supplier_by' => ['nullable', 'string', 'max:255'],
            'supplier_contact_no' => ['nullable', 'string', 'max:255'],
            'supplier_tin' => ['nullable', 'string', 'max:255'],
            'canvasser' => ['nullable', 'string', 'max:255'],
            'bac_action' => ['nullable', 'string', 'max:255'],
            'items' => ['sometimes', 'array', 'min:1'],
            'items.*.purchase_request_item_id' => ['nullable', 'exists:purchase_request_items,id'],
            'items.*.item_no' => ['nullable', 'integer'],
            'items.*.description' => ['nullable', 'string'],
            'items.*.uom' => ['nullable', 'string', 'max:30'],
            'items.*.quantity' => ['required_with:items', 'numeric', 'min:0'],
            'items.*.unit_abc' => ['nullable', 'numeric', 'min:0'],
            'items.*.total_abc' => ['nullable', 'numeric', 'min:0'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.total_price' => ['nullable', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($data, $rfq): void {
            $items = $data['items'] ?? null;
            unset($data['items']);
            $rfq->fill($data)->save();

            if ($items !== null) {
                $rfq->items()->delete();
                $rfq->items()->createMany($this->normalizedItems($items));
            }
        });

        $this->audit($request, 'RFQ', 'Updated RFQ', $rfq->rfq_no);

        return response()->json(['data' => $this->format($rfq->fresh())]);
    }

    public function submit(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');

        $rfq->forceFill([
            'status' => 'For Recommendation',
            'stage' => $this->stagePreference('rfq_recommending_stage', 'Division Chief Recommendation'),
            'submitted_at' => now(),
        ])->save();

        $this->recordAction($request, $rfq, 'Requester', 'Submitted RFQ', 'Initial submission.');

        return response()->json(['message' => 'RFQ submitted for recommendation.', 'data' => $this->format($rfq->fresh())]);
    }

    public function recommend(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('approvals');

        $rfq->forceFill([
            'status' => 'For Approval',
            'stage' => $this->stagePreference('rfq_rd_stage', 'Director Approval'),
        ])->save();
        $this->recordAction($request, $rfq, 'Recommender', 'Recommended', $request->input('remarks'));

        return response()->json(['message' => 'RFQ recommended.', 'data' => $this->format($rfq->fresh())]);
    }

    public function approve(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('approvals');

        $rfq->forceFill(['status' => 'Approved', 'stage' => 'Approved'])->save();
        $this->recordAction($request, $rfq, 'Approver', 'Approved', $request->input('remarks'));

        return response()->json(['message' => 'RFQ approved.', 'data' => $this->format($rfq->fresh())]);
    }

    public function reject(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('approvals');

        $data = $request->validate(['reason' => ['required', 'string']]);
        $rfq->forceFill(['status' => 'Rejected', 'stage' => 'Rejected'])->save();
        $this->recordAction($request, $rfq, 'Approver', 'Rejected', $data['reason']);

        return response()->json(['message' => 'RFQ rejected.', 'data' => $this->format($rfq->fresh())]);
    }

    /** @param array<int, array<string, mixed>> $items */
    private function normalizedItems(array $items): array
    {
        return collect($items)->values()->map(fn (array $item, int $index): array => [
            'purchase_request_item_id' => $item['purchase_request_item_id'] ?? null,
            'item_no' => $item['item_no'] ?? $index + 1,
            'description' => $item['description'] ?? null,
            'uom' => $item['uom'] ?? null,
            'quantity' => $item['quantity'],
            'unit_abc' => $item['unit_abc'] ?? 0,
            'total_abc' => $item['total_abc'] ?? 0,
            'unit_price' => $item['unit_price'] ?? null,
            'total_price' => $item['total_price'] ?? null,
        ])->all();
    }

    /** Reads a SystemPreference key directly (no auto-seed) so RFQ workflow labels
     *  stay configurable without conflating with the PR preference set. */
    private function stagePreference(string $key, string $fallback): string
    {
        return SystemPreference::where('key', $key)->first()?->value['value'] ?? $fallback;
    }

    private function format(Rfq $rfq): array
    {
        $rfq->loadMissing(['purchaseRequest', 'items', 'approvalActions']);

        return [
            'id' => $rfq->id,
            'rfq_no' => $rfq->rfq_no,
            'purchase_request_id' => $rfq->purchase_request_id,
            'pr_no' => $rfq->purchaseRequest?->pr_no,
            'quotation_no' => $rfq->quotation_no,
            'rfq_date' => $rfq->rfq_date,
            'opening_date' => $rfq->opening_date,
            'place_of_delivery' => $rfq->place_of_delivery,
            'estimated_budget' => $rfq->estimated_budget,
            'bac_chairman' => $rfq->bac_chairman,
            'bac_chairman_title' => $rfq->bac_chairman_title,
            'purpose' => $rfq->purpose,
            'fund_source' => $rfq->fund_source_snapshot,
            'supplier_name' => $rfq->supplier_name,
            'supplier_address' => $rfq->supplier_address,
            'supplier_by' => $rfq->supplier_by,
            'supplier_contact_no' => $rfq->supplier_contact_no,
            'supplier_tin' => $rfq->supplier_tin,
            'canvasser' => $rfq->canvasser,
            'bac_action' => $rfq->bac_action,
            'status' => $rfq->status,
            'stage' => $rfq->stage,
            'date_submitted' => $rfq->submitted_at?->toDateString(),
            'items' => $rfq->items,
            'approval_trail' => $rfq->approvalActions,
            'created_at' => $rfq->created_at?->toISOString(),
        ];
    }

    private function nextRfqNo(): string
    {
        $year = now()->year;
        $lastNo = Rfq::where('rfq_no', 'like', "RFQ-{$year}-%")
            ->orderByRaw('CAST(SUBSTRING(rfq_no FROM \'[0-9]+$\') AS INTEGER) DESC')
            ->value('rfq_no');
        $lastSeq = $lastNo ? (int) preg_replace('/\D/', '', substr((string) $lastNo, strlen("RFQ-{$year}-"))) : 0;

        return sprintf('RFQ-%d-%04d', $year, $lastSeq + 1);
    }
}
