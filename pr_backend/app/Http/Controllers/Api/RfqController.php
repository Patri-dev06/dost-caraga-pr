<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Concerns\ManagesCanvass;
use App\Http\Controllers\Controller;
use App\Models\PurchaseRequest;
use App\Models\Rfq;
use App\Models\RfqQuoteItem;
use App\Models\RfqSupplier;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class RfqController extends Controller
{
    use HasProcurementHelpers;
    use ManagesCanvass;

    /** Signed quotation uploads: PDF or a photo/scan, up to 10 MB. */
    public const QUOTATION_RULES = ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'];

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
        $this->abortIfItemsAdded($data['items'], $purchaseRequest);

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

        // Flowchart: "Generate RFQ -> Forward to Supply Officer for counter Digital Sign".
        $this->notify($this->designatedSupplyOfficer(), 'rfq_signing', 'RFQ awaiting your counter-signature',
            "{$rfq->rfq_no} was generated and is awaiting your counter-signature.", "/rfq/{$rfq->id}", ['rfqId' => $rfq->id]);

        return response()->json(['data' => $this->format($rfq->fresh())], 201);
    }

    /** An RFQ canvasses the approved PR's items — none may be added beyond what the PR lists. */
    private function abortIfItemsAdded(array $items, ?PurchaseRequest $purchaseRequest): void
    {
        $prItems = $purchaseRequest?->items()->count() ?? 0;
        abort_if(count($items) > $prItems, 422, "An RFQ lists only the Purchase Request's items ({$prItems}); items cannot be added.");
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

        // A category change after suppliers were picked would leave them in the wrong directory category.
        if (isset($data['procurement_category']) && $data['procurement_category'] !== $rfq->procurement_category) {
            abort_if($rfq->suppliers()->exists(), 422, 'Remove the canvassed suppliers before changing the procurement category.');
        }

        if (isset($data['items'])) {
            $this->abortIfItemsAdded($data['items'], $rfq->purchaseRequest);
        }

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

    // --- Flowchart: Generate RFQ -> Supply Officer counter-sign -> BAC Chair/Vice-Chair sign ---

    public function signAsSupplyOfficer(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        // "Pending Supply Officer Countersign" only holds RFQs signed by the BAC under the old order.
        abort_unless(in_array($rfq->status, ['Draft', 'Pending Supply Officer Countersign'], true), 422, 'This RFQ is not awaiting the Supply Officer counter-signature.');

        $user = $request->user();
        $designated = $this->designatedSupplyOfficer();
        abort_unless($user?->tier === 'superadmin' || ($designated !== null && $designated->id === $user?->id), 403, 'You are not the designated Supply Officer signatory.');
        $this->requireSignature($user);

        $next = $rfq->bac_signed_at ? 'Ready to Send' : 'Pending BAC Signature';
        $rfq->forceFill([
            'status' => $next,
            'stage' => $next,
            'supply_officer_signed_by' => $user->id,
            'supply_officer_signed_name' => $user->name,
            'supply_officer_signed_at' => now(),
        ])->save();
        $this->recordAction($request, $rfq, 'Supply Officer', 'Signed', $request->input('remarks'));

        if ($next === 'Pending BAC Signature') {
            foreach ($this->bacSignatories() as $bac) {
                $this->notify($bac, 'rfq_signing', 'RFQ awaiting BAC signature',
                    "{$rfq->rfq_no} was counter-signed by the Supply Officer and is awaiting the BAC Chairman's or Vice-Chairman's signature.",
                    "/rfq/{$rfq->id}", ['rfqId' => $rfq->id]);
            }
        }

        return response()->json(['message' => 'RFQ counter-signed by the Supply Officer.', 'data' => $this->format($rfq->fresh())]);
    }

    /** One signature from either the BAC Chairman or the BAC Vice-Chairman completes this step. */
    public function signAsBac(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($rfq->status === 'Pending BAC Signature', 422, 'This RFQ is not awaiting the BAC signature.');

        $user = $request->user();
        $role = match (true) {
            $user !== null && $this->designatedBacChair()?->id === $user->id => 'BAC Chairman',
            $user !== null && $this->designatedBacViceChair()?->id === $user->id => 'BAC Vice-Chairman',
            $user?->tier === 'superadmin' => 'BAC (Superadmin)',
            default => null,
        };
        abort_if($role === null, 403, 'Only the designated BAC Chairman or Vice-Chairman may sign this RFQ.');
        $this->requireSignature($user);

        $rfq->forceFill([
            'status' => 'Ready to Send',
            'stage' => 'Ready to Send',
            'bac_signed_by' => $user->id,
            'bac_signed_name' => $user->name,
            'bac_signed_role' => $role,
            'bac_signed_at' => now(),
        ])->save();
        $this->recordAction($request, $rfq, $role, 'Signed', $request->input('remarks'));

        foreach ($this->canvassWatchers($rfq) as $watcher) {
            $this->notify($watcher, 'rfq_ready', 'RFQ ready to send',
                "{$rfq->rfq_no} is fully signed. Choose 3 suppliers from the directory and send it.", "/rfq/{$rfq->id}", ['rfqId' => $rfq->id]);
        }

        return response()->json(['message' => "RFQ signed by the {$role}.", 'data' => $this->format($rfq->fresh())]);
    }

    // --- Flowchart: Filter Supplier based on category -> Choose 3 supplier -> Send RFQ ---

    public function addSupplier(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless(in_array($rfq->status, ['Draft', 'Pending Supply Officer Countersign', 'Pending BAC Signature', 'Ready to Send'], true),
            422, 'Suppliers can only be added before the RFQ is sent.');
        abort_if($rfq->suppliers()->where('status', 'Pending')->count() >= 3, 422, 'This RFQ already has 3 suppliers.');

        $supplier = $this->directorySupplier($request->all(), $rfq);
        $rfq->suppliers()->create($this->snapshot($supplier, $request->input('supplier_by')) + ['status' => 'Pending']);

        $this->audit($request, 'RFQ', 'Added canvass supplier', $rfq->rfq_no);

        return response()->json(['data' => $this->format($rfq->fresh())], 201);
    }

    public function removeSupplier(Request $request, Rfq $rfq, RfqSupplier $rfqSupplier): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($rfqSupplier->rfq_id === $rfq->id, 404);
        abort_unless($rfqSupplier->status === 'Pending', 422, 'Only a supplier the RFQ has not been sent to can be removed.');

        $rfqSupplier->delete();
        $this->audit($request, 'RFQ', 'Removed canvass supplier', $rfq->rfq_no);

        return response()->json(['data' => $this->format($rfq->fresh())]);
    }

    public function send(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($rfq->status === 'Ready to Send', 422, 'This RFQ must be counter-signed by the Supply Officer and signed by the BAC Chairman or Vice-Chairman before it can be sent.');

        $pending = $rfq->suppliers()->where('status', 'Pending')->get();
        abort_unless($pending->count() === 3, 422, 'Choose exactly 3 suppliers before sending.');

        // The Supply team delivers the RFQ to each supplier; this records that it went out and
        // starts each supplier's 7-day reply window.
        DB::transaction(function () use ($pending, $rfq): void {
            foreach ($pending as $rfqSupplier) {
                $this->sendToSupplier($rfqSupplier);
            }
            $rfq->forceFill(['status' => 'Canvassing', 'stage' => 'Canvassing'])->save();
        });

        $this->recordAction($request, $rfq, 'Canvasser', 'Sent to Suppliers', null);

        return response()->json([
            'message' => 'RFQ marked as sent to the 3 suppliers. Record each signed quotation as it comes back.',
            'data' => $this->format($rfq->fresh()),
        ]);
    }

    /**
     * Flowchart: "Supplier sends back signed quotation". The Supply team types in the prices and
     * attaches the scan of the signed quotation the supplier handed back.
     */
    public function recordQuote(Request $request, Rfq $rfq, RfqSupplier $rfqSupplier): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($rfqSupplier->rfq_id === $rfq->id, 404);
        abort_unless($rfqSupplier->status === 'Sent', 422, 'This supplier is not awaiting a quote.');

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.rfq_item_id' => ['required', 'exists:rfq_items,id'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'quotation' => self::QUOTATION_RULES,
        ], ['quotation.required' => 'Attach the supplier\'s signed quotation (PDF or photo).']);

        $rfqSupplier->setRelation('rfq', $rfq);
        $this->storeQuote($rfqSupplier, $data['items'], $request->file('quotation'), 'Staff');
        $this->audit($request, 'RFQ', 'Recorded supplier quote', $rfqSupplier->supplier_name);

        return response()->json(['data' => $this->format($rfq->fresh())]);
    }

    /** Downloads the signed quotation a supplier sent back. */
    public function quotation(Rfq $rfq, RfqSupplier $rfqSupplier): StreamedResponse
    {
        $this->guardRfqOrApprovals();
        abort_unless($rfqSupplier->rfq_id === $rfq->id && $rfqSupplier->quotation_path, 404);

        return Storage::disk('local')->download($rfqSupplier->quotation_path, $rfqSupplier->quotation_original_name ?: basename($rfqSupplier->quotation_path));
    }

    /** Flowchart: "Cancel sent RFQ of Non-responding Supplier", done early by staff (e.g. the supplier declined). */
    public function cancelSupplier(Request $request, Rfq $rfq, RfqSupplier $rfqSupplier): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($rfqSupplier->rfq_id === $rfq->id, 404);
        abort_unless($rfqSupplier->status === 'Sent', 422, 'Only a supplier still awaiting its reply can be cancelled.');

        $data = $request->validate(['reason' => ['nullable', 'string', 'max:1000']]);
        $reason = $data['reason'] ?? 'Cancelled by staff: the supplier did not respond.';
        $rfqSupplier->setRelation('rfq', $rfq);
        $this->cancelSupplierRfq($rfqSupplier, $reason, auto: false);
        $this->recordAction($request, $rfq, 'Canvasser', 'Cancelled supplier RFQ', "{$rfqSupplier->supplier_name}: {$reason}");

        return response()->json(['data' => $this->format($rfq->fresh())]);
    }

    /**
     * Flowchart: "Choose n of supplier" (after a no-reply cancellation) and "Choose n of supplier
     * needed" (after every supplier failed the TWG check). n is how many slots those left open.
     */
    public function chooseReplacements(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless(in_array($rfq->status, ['Canvassing', 'TWG Evaluation'], true), 422, 'Replacement suppliers can only be chosen while the RFQ is being canvassed.');
        abort_if($rfq->abstractOfCanvas()->exists(), 422, 'The Abstract of Canvas has already been generated for this RFQ.');

        $vacated = $rfq->suppliers()->whereIn('status', RfqSupplier::VACATED_STATUSES)->whereNull('replaced_by_supplier_id')->orderBy('id')->get();
        abort_if($vacated->isEmpty(), 422, 'No supplier slot is open: replacements are chosen for suppliers whose RFQ was cancelled or who failed the TWG check.');

        $request->validate([
            'suppliers' => ['required', 'array', 'min:1', 'max:'.$vacated->count()],
            'suppliers.*' => ['array'],
        ], ['suppliers.max' => "Choose at most {$vacated->count()} replacement supplier(s)."]);

        $rows = array_values($request->input('suppliers'));
        $chosen = collect($rows)->map(fn (array $row) => $this->directorySupplier($row, $rfq));
        abort_if($chosen->pluck('id')->duplicates()->isNotEmpty(), 422, 'Choose each replacement supplier only once.');

        DB::transaction(function () use ($chosen, $rows, $vacated, $rfq): void {
            foreach ($chosen->values() as $i => $supplier) {
                $new = $rfq->suppliers()->create($this->snapshot($supplier, $rows[$i]['supplier_by'] ?? null) + ['status' => 'Pending']);
                $vacated[$i]->forceFill(['replaced_by_supplier_id' => $new->id])->save();
                $this->sendToSupplier($new);
            }
        });

        $this->refreshCanvassState($rfq);
        $this->recordAction($request, $rfq, 'Canvasser', 'Chose replacement suppliers', $chosen->pluck('name')->implode(', '));

        return response()->json([
            'message' => 'Replacement supplier(s) added and marked as sent. Deliver the RFQ to them and record each signed quotation as it comes back.',
            'data' => $this->format($rfq->fresh()),
        ], 201);
    }

    // --- Flowchart (Equipment): TWG Specification evaluation -> Check each equipment with supplier ---

    public function saveTwgNotes(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        $this->abortUnlessTwgLead($request);
        abort_unless($rfq->status === 'TWG Evaluation', 422, 'This RFQ is not awaiting TWG evaluation.');

        $data = $request->validate(['notes' => ['required', 'string']]);
        $rfq->forceFill(['twg_evaluation_notes' => $data['notes']])->save();
        $this->audit($request, 'RFQ', 'Saved TWG specification evaluation', $rfq->rfq_no);

        return response()->json(['data' => $this->format($rfq->fresh())]);
    }

    /**
     * Records whether each quoted equipment item complies with the specifications. A supplier fails if
     * any item does not. Once every supplier that replied is checked: if all failed, they drop out and
     * Supply chooses n new suppliers ("Did all supplier fail? Yes"); otherwise the AOC can be made
     * from the ones that passed.
     */
    public function twgCheck(Request $request, Rfq $rfq, RfqSupplier $rfqSupplier): JsonResponse
    {
        $this->guardModule('rfq');
        $this->abortUnlessTwgLead($request);
        abort_unless($rfqSupplier->rfq_id === $rfq->id, 404);
        abort_unless($rfq->status === 'TWG Evaluation', 422, 'This RFQ is not awaiting TWG evaluation.');
        abort_unless($rfqSupplier->status === 'Replied', 422, 'Only a supplier that sent a quotation can be checked.');

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.rfq_item_id' => ['required', 'integer'],
            'items.*.complies' => ['required', 'boolean'],
            'items.*.remarks' => ['nullable', 'string', 'max:2000'],
        ]);

        $quoteItems = $rfqSupplier->quoteItems()->get()->keyBy(fn (RfqQuoteItem $qi) => (int) $qi->rfq_item_id);
        $given = collect($data['items'])->keyBy(fn (array $row) => (int) $row['rfq_item_id']);
        abort_unless($given->keys()->sort()->values()->all() === $quoteItems->keys()->sort()->values()->all(),
            422, 'Check every quoted equipment item for this supplier.');

        $passed = $given->every(fn (array $row) => (bool) $row['complies']);
        DB::transaction(function () use ($given, $quoteItems, $rfqSupplier, $passed): void {
            foreach ($given as $rfqItemId => $row) {
                $quoteItems[$rfqItemId]->forceFill(['twg_complies' => (bool) $row['complies'], 'twg_remarks' => $row['remarks'] ?? null])->save();
            }
            $rfqSupplier->forceFill(['twg_result' => $passed ? 'Passed' : 'Failed', 'twg_evaluated_at' => now()])->save();
        });
        $this->recordAction($request, $rfq, 'TWG', $passed ? 'Equipment check passed' : 'Equipment check failed', $rfqSupplier->supplier_name);

        $replied = $rfq->suppliers()->where('status', 'Replied')->get();
        $message = "TWG check recorded for {$rfqSupplier->supplier_name}.";
        if ($replied->every(fn (RfqSupplier $s) => $s->twg_result !== null)) {
            if ($replied->every(fn (RfqSupplier $s) => $s->twg_result === 'Failed')) {
                // "Did all supplier fail? Yes" -> "Choose n of supplier needed".
                $rfq->suppliers()->whereIn('id', $replied->pluck('id'))->update(['status' => 'Failed TWG']);
                $rfq->forceFill(['status' => 'Canvassing', 'stage' => 'Canvassing'])->save();
                foreach ($this->canvassWatchers($rfq) as $watcher) {
                    $this->notify($watcher, 'rfq_twg_all_failed', 'Every supplier failed the TWG check',
                        "No supplier's equipment for {$rfq->rfq_no} met the specifications. Choose {$replied->count()} new supplier(s) to canvass.",
                        "/rfq/{$rfq->id}", ['rfqId' => $rfq->id]);
                }
                $message = 'Every supplier failed the TWG check. Supply must choose new suppliers.';
            } else {
                foreach ($this->canvassWatchers($rfq) as $watcher) {
                    $this->notify($watcher, 'rfq_twg_done', 'TWG evaluation complete',
                        "The TWG finished checking the equipment for {$rfq->rfq_no}. Generate the Abstract of Canvas from the suppliers that passed.",
                        "/rfq/{$rfq->id}", ['rfqId' => $rfq->id]);
                }
                $message = 'TWG evaluation complete. The Abstract of Canvas can be generated from the suppliers that passed.';
            }
        }

        return response()->json(['message' => $message, 'data' => $this->format($rfq->fresh())]);
    }

    // --- helpers ---

    /**
     * Resolves the supplier to canvass from the directory — "Filter Supplier based on category". A new
     * supplier typed in is added to the directory first, in the category this RFQ needs.
     *
     * @param  array<string, mixed>  $input
     */
    private function directorySupplier(array $input, Rfq $rfq): Supplier
    {
        $data = validator($input, [
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'supplier_name' => ['required_without:supplier_id', 'nullable', 'string', 'max:255'],
            'supplier_address' => ['nullable', 'string', 'max:255'],
            'supplier_contact_no' => ['nullable', 'string', 'max:255'],
            'supplier_email' => ['nullable', 'email', 'max:255'],
            'supplier_tin' => ['nullable', 'string', 'max:255'],
        ])->validate();

        $category = self::supplierCategoryFor($rfq->procurement_category);

        if (! empty($data['supplier_id'])) {
            $supplier = Supplier::findOrFail($data['supplier_id']);
            abort_unless($supplier->active, 422, "{$supplier->name} is deactivated in the supplier directory.");
            abort_unless($supplier->category === $category, 422, "{$supplier->name} is a {$supplier->category} supplier; a {$rfq->procurement_category} RFQ needs a {$category} supplier.");
        } else {
            $supplier = Supplier::whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower(trim((string) $data['supplier_name']))])->where('category', $category)->first()
                ?? Supplier::create([
                    'name' => trim((string) $data['supplier_name']),
                    'address' => $data['supplier_address'] ?? null,
                    'contact_no' => $data['supplier_contact_no'] ?? null,
                    'email' => $data['supplier_email'] ?? null,
                    'tin' => $data['supplier_tin'] ?? null,
                    'category' => $category,
                    'active' => true,
                ]);
            abort_unless($supplier->active, 422, "{$supplier->name} is deactivated in the supplier directory.");
        }

        // Once canvassed, a supplier stays off this RFQ even after it timed out or failed the TWG check.
        abort_if($rfq->suppliers()->where('supplier_id', $supplier->id)->where('status', '!=', 'Replaced')->exists(),
            422, "{$supplier->name} is already on this RFQ's canvass.");

        return $supplier;
    }

    /** Goods and Equipment come from Goods suppliers; a venue is a service. */
    public static function supplierCategoryFor(?string $procurementCategory): string
    {
        return $procurementCategory === 'Venue' ? 'Services' : 'Goods';
    }

    /** Frozen at canvass time, independent of later edits to the directory entry. */
    private function snapshot(Supplier $supplier, ?string $supplierBy): array
    {
        return [
            'supplier_id' => $supplier->id,
            'supplier_name' => $supplier->name,
            'supplier_address' => $supplier->address,
            'supplier_contact_no' => $supplier->contact_no,
            'supplier_email' => $supplier->email,
            'supplier_tin' => $supplier->tin,
            'supplier_by' => $supplierBy,
        ];
    }

    /** @return array<int, \App\Models\User> */
    private function bacSignatories(): array
    {
        return collect([$this->designatedBacChair(), $this->designatedBacViceChair()])->filter()->unique('id')->values()->all();
    }

    private function abortUnlessTwgLead(Request $request): void
    {
        $user = $request->user();
        $twg = $this->designatedTwgLead();
        abort_unless($user?->tier === 'superadmin' || ($twg !== null && $twg->id === $user?->id), 403, 'Only the designated TWG Lead may evaluate equipment.');
    }

    private function guardRfqOrApprovals(): void
    {
        $user = request()->user();
        abort_unless($user?->canAccessModule('rfq') || $user?->canAccessModule('approvals'), 403, 'You do not have access to this module.');
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

        $vacated = $rfq->suppliers->filter(fn (RfqSupplier $s) => in_array($s->status, RfqSupplier::VACATED_STATUSES, true) && $s->replaced_by_supplier_id === null);

        return [
            'id' => $rfq->id,
            'rfq_no' => $rfq->rfq_no,
            'purchase_request_id' => $rfq->purchase_request_id,
            'pr_no' => $rfq->purchaseRequest?->pr_no,
            'procurement_category' => $rfq->procurement_category,
            'supplier_category' => self::supplierCategoryFor($rfq->procurement_category),
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
            'supply_officer_signed_name' => $rfq->supply_officer_signed_name,
            'supply_officer_signed_at' => $rfq->supply_officer_signed_at?->toISOString(),
            'bac_signed_name' => $rfq->bac_signed_name,
            'bac_signed_role' => $rfq->bac_signed_role,
            'bac_signed_at' => $rfq->bac_signed_at?->toISOString(),
            'twg_evaluation_notes' => $rfq->twg_evaluation_notes,
            'prepared_by' => $this->preparedBy($rfq->creator),
            'status' => $rfq->status,
            'stage' => $rfq->stage,
            'date_submitted' => $rfq->submitted_at?->toDateString(),
            'items' => $rfq->items,
            'suppliers' => $rfq->suppliers->map(fn (RfqSupplier $s) => $this->formatSupplier($s)),
            'open_supplier_slots' => $vacated->count(),
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
            'supplier_email' => $s->supplier_email,
            'supplier_tin' => $s->supplier_tin,
            'supplier_by' => $s->supplier_by,
            'status' => $s->status,
            'sent_at' => $s->sent_at?->toISOString(),
            'reply_due_at' => $s->reply_due_at?->toISOString(),
            'replied_at' => $s->replied_at?->toISOString(),
            'is_overdue' => $s->is_overdue,
            'is_winner' => $s->is_winner,
            'replaced_by_supplier_id' => $s->replaced_by_supplier_id,
            'has_quotation' => $s->quotation_path !== null,
            'quotation_name' => $s->quotation_original_name,
            'quote_submitted_via' => $s->quote_submitted_via,
            'twg_result' => $s->twg_result,
            'twg_evaluated_at' => $s->twg_evaluated_at?->toISOString(),
            'remarks' => $s->remarks,
            'quote_items' => $s->quoteItems->map(fn (RfqQuoteItem $qi) => [
                'rfq_item_id' => $qi->rfq_item_id,
                'unit_price' => $qi->unit_price,
                'total_price' => $qi->total_price,
                'twg_complies' => $qi->twg_complies,
                'twg_remarks' => $qi->twg_remarks,
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
