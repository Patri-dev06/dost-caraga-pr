<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Controller;
use App\Models\PurchaseRequest;
use App\Models\Rfq;
use App\Models\RfqItem;
use App\Models\RfqQuoteItem;
use App\Models\RfqSupplier;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RfqController extends Controller
{
    use HasProcurementHelpers;

    public function index(Request $request): JsonResponse
    {
        $this->guardModule('rfq');

        $query = Rfq::with(['purchaseRequest', 'items', 'suppliers.quoteItems', 'approvalActions']);

        if ($request->query('purchase_request_id')) {
            $query->where('purchase_request_id', $request->query('purchase_request_id'));
        }

        if ($request->query('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        // Never the whole table: capped, real pagination (defaults to 20/page).
        $page = $query->latest('id')->paginate(min((int) $request->query('per_page', 20), 100));

        return response()->json($page->through(fn (Rfq $rfq) => $this->format($rfq)));
    }

    public function store(Request $request): JsonResponse
    {
        $this->guardModule('rfq');

        $data = $request->validate([
            'purchase_request_id' => ['required', 'exists:purchase_requests,id'],
            'procurement_category' => ['nullable', 'in:Goods,Equipment,Venue'],
            'quotation_no' => ['nullable', 'string', 'max:255'],
            'rfq_date' => ['nullable', 'string', 'max:255'],
            'opening_date' => ['nullable', 'string', 'max:255'],
            'place_of_delivery' => ['nullable', 'string', 'max:255'],
            'estimated_budget' => ['nullable', 'numeric', 'min:0'],
            'bac_chairman' => ['nullable', 'string', 'max:255'],
            'bac_chairman_title' => ['nullable', 'string', 'max:255'],
            'purpose' => ['nullable', 'string'],
            'fund_source_snapshot' => ['nullable', 'string', 'max:255'],
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
        ]);

        $purchaseRequest = PurchaseRequest::with('fundSource')->findOrFail($data['purchase_request_id']);
        abort_unless($purchaseRequest->status === 'Approved', 422, 'RFQs can only be generated from an approved Purchase Request.');

        $rfq = DB::transaction(function () use ($data, $purchaseRequest, $request): Rfq {
            $rfq = Rfq::create([
                'rfq_no' => $this->nextRfqNo(),
                'purchase_request_id' => $purchaseRequest->id,
                'procurement_category' => $data['procurement_category'] ?? 'Goods',
                'quotation_no' => $data['quotation_no'] ?? null,
                'rfq_date' => $data['rfq_date'] ?? null,
                'opening_date' => $data['opening_date'] ?? null,
                'place_of_delivery' => $data['place_of_delivery'] ?? null,
                'estimated_budget' => $data['estimated_budget'] ?? collect($data['items'])->sum(fn ($item) => (float) ($item['total_abc'] ?? 0)),
                'bac_chairman' => $data['bac_chairman'] ?? null,
                'bac_chairman_title' => $data['bac_chairman_title'] ?? null,
                'purpose' => $data['purpose'] ?? $purchaseRequest->purpose,
                'fund_source_snapshot' => $data['fund_source_snapshot'] ?? $purchaseRequest->fundSource?->name,
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
        abort_unless($rfq->status === 'Draft', 422, 'Only a Draft RFQ (not yet signed) may be edited.');

        $data = $request->validate([
            'procurement_category' => ['nullable', 'in:Goods,Equipment,Venue'],
            'quotation_no' => ['nullable', 'string', 'max:255'],
            'rfq_date' => ['nullable', 'string', 'max:255'],
            'opening_date' => ['nullable', 'string', 'max:255'],
            'place_of_delivery' => ['nullable', 'string', 'max:255'],
            'estimated_budget' => ['nullable', 'numeric', 'min:0'],
            'bac_chairman' => ['nullable', 'string', 'max:255'],
            'bac_chairman_title' => ['nullable', 'string', 'max:255'],
            'purpose' => ['nullable', 'string'],
            'fund_source_snapshot' => ['nullable', 'string', 'max:255'],
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

    // --- Pre-send signing chain: BAC Chair -> BAC Vice-Chair -> Supply Officer ---

    public function signAsBacChair(Request $request, Rfq $rfq): JsonResponse
    {
        return $this->advanceRfqSigning($request, $rfq, 'bac_chair');
    }

    public function signAsBacViceChair(Request $request, Rfq $rfq): JsonResponse
    {
        return $this->advanceRfqSigning($request, $rfq, 'bac_vice_chair');
    }

    public function signAsSupplyOfficer(Request $request, Rfq $rfq): JsonResponse
    {
        return $this->advanceRfqSigning($request, $rfq, 'supply_officer');
    }

    private function advanceRfqSigning(Request $request, Rfq $rfq, string $step): JsonResponse
    {
        $this->guardModule('rfq');

        $steps = [
            'bac_chair' => ['from' => 'Draft', 'to' => 'Pending BAC Vice-Chair Signature', 'designated' => fn () => $this->designatedBacChair(), 'label' => 'BAC Chair'],
            'bac_vice_chair' => ['from' => 'Pending BAC Vice-Chair Signature', 'to' => 'Pending Supply Officer Countersign', 'designated' => fn () => $this->designatedBacViceChair(), 'label' => 'BAC Vice-Chair'],
            'supply_officer' => ['from' => 'Pending Supply Officer Countersign', 'to' => 'Ready to Send', 'designated' => fn () => $this->designatedSupplyOfficer(), 'label' => 'Supply Officer'],
        ][$step];

        abort_unless($rfq->status === $steps['from'], 422, "This RFQ is not awaiting the {$steps['label']} signature.");

        $user = $request->user();
        $designated = $steps['designated']();
        $ok = $user?->tier === 'superadmin' || ($designated !== null && $designated->id === $user?->id);
        abort_unless($ok, 403, "You are not the designated {$steps['label']} signatory.");
        $this->requireSignature($user);

        $rfq->forceFill([
            'status' => $steps['to'],
            'stage' => $steps['to'],
            "{$step}_signed_by" => $user->id,
            "{$step}_signed_name" => $user->name,
            "{$step}_signed_at" => now(),
        ])->save();

        $this->recordAction($request, $rfq, $steps['label'], 'Signed', $request->input('remarks'));

        $nextDesignated = match ($steps['to']) {
            'Pending BAC Vice-Chair Signature' => $this->designatedBacViceChair(),
            'Pending Supply Officer Countersign' => $this->designatedSupplyOfficer(),
            default => null,
        };
        if ($nextDesignated) {
            $this->notify($nextDesignated, 'rfq_signing', 'RFQ awaiting your signature',
                "{$rfq->rfq_no} is awaiting your signature.", "/rfq/new?rfqId={$rfq->id}", ['rfqId' => $rfq->id]);
        }

        return response()->json(['message' => "RFQ signed by {$steps['label']}.", 'data' => $this->format($rfq->fresh())]);
    }

    // --- Multi-supplier canvass ---

    public function addSupplier(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless(in_array($rfq->status, ['Draft', 'Pending BAC Vice-Chair Signature', 'Pending Supply Officer Countersign', 'Ready to Send'], true),
            422, 'Suppliers can only be added before the RFQ is sent.');
        abort_if($rfq->suppliers()->where('status', '!=', 'Replaced')->count() >= 3, 422, 'This RFQ already has 3 active suppliers.');

        $data = $request->validate([
            'supplier_id' => ['nullable', 'exists:suppliers,id'],
            'supplier_name' => ['required_without:supplier_id', 'nullable', 'string', 'max:255'],
            'supplier_address' => ['nullable', 'string', 'max:255'],
            'supplier_contact_no' => ['nullable', 'string', 'max:255'],
            'supplier_tin' => ['nullable', 'string', 'max:255'],
            'supplier_by' => ['nullable', 'string', 'max:255'],
        ]);

        $supplier = isset($data['supplier_id']) ? Supplier::find($data['supplier_id']) : null;

        $rfq->suppliers()->create([
            'supplier_id' => $supplier?->id,
            'supplier_name' => $data['supplier_name'] ?? $supplier?->name,
            'supplier_address' => $data['supplier_address'] ?? $supplier?->address,
            'supplier_contact_no' => $data['supplier_contact_no'] ?? $supplier?->contact_no,
            'supplier_tin' => $data['supplier_tin'] ?? $supplier?->tin,
            'supplier_by' => $data['supplier_by'] ?? null,
            'status' => 'Pending',
        ]);

        $this->audit($request, 'RFQ', 'Added canvass supplier', $rfq->rfq_no);

        return response()->json(['data' => $this->format($rfq->fresh())], 201);
    }

    public function send(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($rfq->status === 'Ready to Send', 422, 'This RFQ must complete BAC Chair, BAC Vice-Chair, and Supply Officer signing before it can be sent.');

        $pending = $rfq->suppliers()->where('status', 'Pending')->get();
        abort_unless($pending->count() === 3, 422, 'Exactly 3 suppliers must be added before sending.');

        $now = now();
        foreach ($pending as $rfqSupplier) {
            $rfqSupplier->forceFill(['status' => 'Sent', 'sent_at' => $now, 'reply_due_at' => $now->copy()->addDays(7)])->save();
        }
        $rfq->forceFill(['status' => 'Canvassing', 'stage' => 'Canvassing'])->save();

        $this->recordAction($request, $rfq, 'Canvasser', 'Sent to Suppliers', null);

        return response()->json(['message' => 'RFQ sent to suppliers.', 'data' => $this->format($rfq->fresh())]);
    }

    /** Canvasser records a supplier's reply (no external portal — staff data entry). */
    public function recordQuote(Request $request, Rfq $rfq, RfqSupplier $rfqSupplier): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($rfqSupplier->rfq_id === $rfq->id, 404);
        abort_unless($rfqSupplier->status === 'Sent', 422, 'This supplier is not awaiting a quote.');

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.rfq_item_id' => ['required', 'exists:rfq_items,id'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($data, $rfqSupplier): void {
            foreach ($data['items'] as $item) {
                $rfqItem = RfqItem::find($item['rfq_item_id']);
                RfqQuoteItem::updateOrCreate(
                    ['rfq_supplier_id' => $rfqSupplier->id, 'rfq_item_id' => $item['rfq_item_id']],
                    ['unit_price' => $item['unit_price'], 'total_price' => (float) $item['unit_price'] * (float) $rfqItem->quantity],
                );
            }
            $rfqSupplier->forceFill(['status' => 'Replied'])->save();
        });

        $this->audit($request, 'RFQ', 'Recorded supplier quote', $rfqSupplier->supplier_name);

        return response()->json(['data' => $this->format($rfq->fresh())]);
    }

    /** Marks a non-responding/overdue supplier resolved and canvasses a replacement in its place. */
    public function replaceSupplier(Request $request, Rfq $rfq, RfqSupplier $rfqSupplier): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($rfqSupplier->rfq_id === $rfq->id, 404);
        abort_unless($rfqSupplier->status === 'Sent', 422, 'Only a supplier still awaiting reply can be replaced.');

        $data = $request->validate([
            'supplier_id' => ['nullable', 'exists:suppliers,id'],
            'supplier_name' => ['required_without:supplier_id', 'nullable', 'string', 'max:255'],
            'supplier_address' => ['nullable', 'string', 'max:255'],
            'supplier_contact_no' => ['nullable', 'string', 'max:255'],
            'supplier_tin' => ['nullable', 'string', 'max:255'],
            'supplier_by' => ['nullable', 'string', 'max:255'],
            'reason' => ['nullable', 'string'],
        ]);

        $supplier = isset($data['supplier_id']) ? Supplier::find($data['supplier_id']) : null;
        $wasOverdue = $rfqSupplier->is_overdue;

        DB::transaction(function () use ($data, $supplier, $rfq, $rfqSupplier, $wasOverdue): void {
            $now = now();
            $new = $rfq->suppliers()->create([
                'supplier_id' => $supplier?->id,
                'supplier_name' => $data['supplier_name'] ?? $supplier?->name,
                'supplier_address' => $data['supplier_address'] ?? $supplier?->address,
                'supplier_contact_no' => $data['supplier_contact_no'] ?? $supplier?->contact_no,
                'supplier_tin' => $data['supplier_tin'] ?? $supplier?->tin,
                'supplier_by' => $data['supplier_by'] ?? null,
                'status' => 'Sent',
                'sent_at' => $now,
                'reply_due_at' => $now->copy()->addDays(7),
            ]);

            $rfqSupplier->forceFill([
                'status' => $wasOverdue ? 'TimedOut' : 'Replaced',
                'replaced_by_supplier_id' => $new->id,
                'remarks' => $data['reason'] ?? $rfqSupplier->remarks,
            ])->save();
        });

        $this->audit($request, 'RFQ', 'Replaced canvass supplier', $rfq->rfq_no);

        return response()->json(['data' => $this->format($rfq->fresh())], 201);
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
        ])->all();
    }

    private function format(Rfq $rfq): array
    {
        $rfq->loadMissing(['purchaseRequest', 'items', 'suppliers.quoteItems', 'approvalActions', 'abstractOfCanvas', 'creator.roles']);

        return [
            'id' => $rfq->id,
            'rfq_no' => $rfq->rfq_no,
            'purchase_request_id' => $rfq->purchase_request_id,
            'pr_no' => $rfq->purchaseRequest?->pr_no,
            'procurement_category' => $rfq->procurement_category,
            'quotation_no' => $rfq->quotation_no,
            'rfq_date' => $rfq->rfq_date,
            'opening_date' => $rfq->opening_date,
            'place_of_delivery' => $rfq->place_of_delivery,
            'estimated_budget' => $rfq->estimated_budget,
            'bac_chairman' => $rfq->bac_chairman,
            'bac_chairman_title' => $rfq->bac_chairman_title,
            'purpose' => $rfq->purpose,
            'fund_source' => $rfq->fund_source_snapshot,
            'canvasser' => $rfq->canvasser,
            'bac_action' => $rfq->bac_action,
            'bac_chair_signed_name' => $rfq->bac_chair_signed_name,
            'bac_chair_signed_at' => $rfq->bac_chair_signed_at?->toISOString(),
            'bac_vice_chair_signed_name' => $rfq->bac_vice_chair_signed_name,
            'bac_vice_chair_signed_at' => $rfq->bac_vice_chair_signed_at?->toISOString(),
            'supply_officer_signed_name' => $rfq->supply_officer_signed_name,
            'supply_officer_signed_at' => $rfq->supply_officer_signed_at?->toISOString(),
            'prepared_by' => $this->preparedBy($rfq->creator),
            'status' => $rfq->status,
            'stage' => $rfq->stage,
            'date_submitted' => $rfq->submitted_at?->toDateString(),
            'items' => $rfq->items,
            'suppliers' => $rfq->suppliers->map(fn (RfqSupplier $s) => $this->formatSupplier($s)),
            'abstract_of_canvas_id' => $rfq->abstractOfCanvas?->id,
            'abstract_of_canvas_status' => $rfq->abstractOfCanvas?->status,
            'has_purchase_order' => $rfq->purchaseOrders()->exists(),
            'approval_trail' => $rfq->approvalActions,
            'created_at' => $rfq->created_at?->toISOString(),
        ];
    }

    private function formatSupplier(RfqSupplier $s): array
    {
        return [
            'id' => $s->id,
            'supplier_id' => $s->supplier_id,
            'supplier_name' => $s->supplier_name,
            'supplier_address' => $s->supplier_address,
            'supplier_contact_no' => $s->supplier_contact_no,
            'supplier_tin' => $s->supplier_tin,
            'supplier_by' => $s->supplier_by,
            'status' => $s->status,
            'sent_at' => $s->sent_at?->toISOString(),
            'reply_due_at' => $s->reply_due_at?->toISOString(),
            'is_overdue' => $s->is_overdue,
            'is_winner' => $s->is_winner,
            'replaced_by_supplier_id' => $s->replaced_by_supplier_id,
            'quote_items' => $s->quoteItems->map(fn (RfqQuoteItem $qi) => [
                'rfq_item_id' => $qi->rfq_item_id,
                'unit_price' => $qi->unit_price,
                'total_price' => $qi->total_price,
            ]),
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
