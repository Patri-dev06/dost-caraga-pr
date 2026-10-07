<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\CancelsPurchaseRequests;
use App\Http\Controllers\Concerns\HandlesSignedCopies;
use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Controller;
use App\Models\AbstractOfCanvas;
use App\Models\Rfq;
use App\Models\RfqQuoteItem;
use App\Models\RfqSupplier;
use App\Models\User;
use App\Models\VenueRating;
use App\Services\CreatePurchaseOrdersFromAoc;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The Abstract of Canvass, from generation through the orange BAC lane to Supply's confirmation
 * of the per-item awards and automatic Purchase Order creation:
 *
 *   Goods     -> Generate AOC -> BAC Review
 *   Equipment -> (TWG checks on the RFQ) -> Generate AOC from the suppliers that passed -> BAC Review
 *   Venue     -> Generate AOC -> Individual rating of each venue -> Summary of rating -> BAC Review
 *
 *   BAC Review (digital sign) -> Fail? Yes -> remarks, notify TWG/end-user/Supply -> TWG addresses remarks
 *        -> BAC satisfied? Yes -> BAC Review again | No -> Cancel PR -> Re-PR
 *                             No  -> For Supply Noting -> Item Awards Confirmed -> Create POs
 */
class AbstractOfCanvasController extends Controller
{
    use CancelsPurchaseRequests;
    use HandlesSignedCopies;
    use HasProcurementHelpers;

    public function generate(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        abort_if($rfq->abstractOfCanvas()->exists(), 422, 'An Abstract of Canvass has already been generated for this RFQ.');
        abort_if(in_array($rfq->status, ['Cancelled', 'Draft', 'Pending Supply Officer Countersign', 'Pending BAC Signature', 'Ready to Send'], true), 422, 'This RFQ has not been canvassed.');

        $unresolved = $rfq->suppliers()->whereIn('status', ['Pending', 'Sent'])->exists();
        abort_if($unresolved, 422, 'Every canvassed supplier must have replied or had its RFQ cancelled before generating the Abstract of Canvass.');

        $replied = $rfq->suppliers()->where('status', 'Replied')->with('quoteItems')->get();
        abort_if($replied->isEmpty(), 422, 'At least one supplier must have replied with a quotation.');

        $data = $request->validate(['twg_evaluation_notes' => ['nullable', 'string']]);
        $category = $rfq->procurement_category;

        if ($category === 'Equipment') {
            abort_unless($rfq->status === 'TWG Evaluation', 422, 'The TWG must evaluate the equipment before the Abstract of Canvass is generated.');
            if (! empty($data['twg_evaluation_notes'])) {
                $rfq->forceFill(['twg_evaluation_notes' => $data['twg_evaluation_notes']])->save();
            }
            abort_if(empty($rfq->twg_evaluation_notes), 422, 'TWG evaluation notes are required for Equipment procurement before generating the Abstract of Canvass.');
            abort_if($replied->contains(fn (RfqSupplier $s) => $s->twg_result === null), 422, 'The TWG must check each supplier\'s equipment first.');
            $replied = $replied->where('twg_result', 'Passed')->values();
            abort_if($replied->isEmpty(), 422, 'No supplier passed the TWG check. Choose new suppliers to canvass.');
        }

        $criteria = $category === 'Venue' ? $this->venueCriteria() : [];
        $raters = $category === 'Venue' ? $this->venueRaters($rfq) : [];
        abort_if($category === 'Venue' && ($criteria === [] || $raters === []), 422, 'Set the venue rating criteria and the TWG Lead / Supply Officer in Settings first.');
        $signatories = $this->signatorySnapshot();

        $aoc = DB::transaction(function () use ($rfq, $request, $category, $criteria, $raters, $replied, $signatories): AbstractOfCanvas {
            $aoc = AbstractOfCanvas::create([
                'rfq_id' => $rfq->id,
                'procurement_category' => $category,
                'twg_evaluation_notes' => $rfq->twg_evaluation_notes,
                'winning_rfq_supplier_id' => null,
                'status' => $category === 'Venue' ? 'For Venue Rating' : 'Draft',
                'venue_rating_summary' => $category === 'Venue' ? [
                    'criteria' => $criteria,
                    'raters' => $raters,
                    'venue_ids' => $replied->pluck('id')->all(),
                ] : null,
                'signatory_snapshot' => $signatories,
                'created_by' => $request->user()->id,
            ]);

            if ($category !== 'Venue') {
                $this->rebuildItemAwards($aoc, $replied);
            }

            return $aoc;
        });

        $this->audit($request, 'AOC', 'Generated Abstract of Canvass', $rfq->rfq_no);

        if ($category === 'Venue') {
            foreach ($raters as $rater) {
                $this->notify(User::find($rater['id']), 'aoc_venue_rating', 'Venues awaiting your rating',
                    "Rate each venue quoted for {$rfq->rfq_no} on ".implode(', ', $criteria).'.', "/aoc/{$aoc->id}", ['aocId' => $aoc->id]);
            }
        }

        return response()->json(['data' => $this->format($aoc->fresh())], 201);
    }

    /** Queue of Abstracts of Canvas, optionally filtered by status (comma-separated), for the BAC review inbox. */
    /**
     * `limit` returns a flat, capped list for a dashboard preview (never the whole queue). Without
     * it, the full BAC Review tab browses the queue with real pagination — either way, the query
     * itself is bounded; it's never an unbounded `get()` of every Abstract of Canvas ever made.
     */
    public function index(Request $request): JsonResponse
    {
        $this->guardRfqOrApprovals();

        $query = AbstractOfCanvas::with(['rfq.purchaseRequest', 'itemAwards.winningSupplier'])->latest('id');

        if ($request->query('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        if ($limit = $request->integer('limit')) {
            return response()->json([
                'data' => $query->limit(min($limit, 50))->get()->map(fn (AbstractOfCanvas $aoc): array => $this->formatSummary($aoc)),
            ]);
        }

        $page = $query->paginate(min((int) $request->query('per_page', 20), 100));

        return response()->json($page->through(fn (AbstractOfCanvas $aoc): array => $this->formatSummary($aoc)));
    }

    /** Venue AOCs waiting on the signed-in user's rating — for the dashboard's "Needs Your Action". */
    public function myVenueRatings(Request $request): JsonResponse
    {
        $user = $request->user();
        $pending = AbstractOfCanvas::with(['rfq.purchaseRequest', 'itemAwards.winningSupplier'])
            ->where('status', 'For Venue Rating')->latest('id')->limit(50)->get()
            ->filter(fn (AbstractOfCanvas $aoc) => collect($aoc->venue_rating_summary['raters'] ?? [])->contains('id', $user->id)
                && ! $aoc->venueRatings()->where('rater_id', $user->id)->exists())
            ->values();

        return response()->json(['data' => $pending->map(fn (AbstractOfCanvas $aoc): array => $this->formatSummary($aoc))]);
    }

    public function show(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardViewer($request, $aoc);

        return response()->json(['data' => $this->format($aoc)]);
    }

    /**
     * Supply verifies every quoted offer per line and may choose among the compliant quotations.
     * The cheapest compliant quote is the default; an explicit choice records a deliberate override.
     */
    public function updateAwards(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($aoc->status === 'Draft', 422, 'Item awards can be edited only while the Abstract of Canvass is a Draft.');
        abort_if($aoc->procurement_category === 'Venue', 422, 'Venue awards are determined by the completed venue ratings.');

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.rfq_item_id' => ['required', 'integer', 'distinct'],
            'items.*.winning_rfq_supplier_id' => ['nullable', 'integer'],
            'items.*.offers' => ['required', 'array'],
            'items.*.offers.*.rfq_supplier_id' => ['required', 'integer'],
            'items.*.offers.*.complies' => ['required', 'boolean'],
            'items.*.offers.*.remarks' => ['nullable', 'string', 'max:2000'],
        ]);

        $aoc->loadMissing(['rfq.items', 'rfq.suppliers.quoteItems']);
        $expectedItems = $aoc->rfq->items->pluck('id')->map(fn ($id) => (int) $id)->sort()->values();
        $givenItems = collect($data['items'])->pluck('rfq_item_id')->map(fn ($id) => (int) $id)->sort()->values();
        abort_unless($expectedItems->all() === $givenItems->all(), 422, 'Review every RFQ item exactly once.');

        $preferred = [];
        DB::transaction(function () use ($aoc, $data, &$preferred): void {
            foreach ($data['items'] as $row) {
                $itemId = (int) $row['rfq_item_id'];
                $quotes = RfqQuoteItem::query()
                    ->where('rfq_item_id', $itemId)
                    ->whereHas('rfqSupplier', fn ($q) => $q->where('rfq_id', $aoc->rfq_id)->where('status', 'Replied'))
                    ->get()
                    ->keyBy('rfq_supplier_id');

                $quotedIds = $quotes->where('offer_status', 'Quoted')->keys()->map(fn ($id) => (int) $id)->sort()->values();
                $givenOffers = collect($row['offers'])->pluck('rfq_supplier_id')->map(fn ($id) => (int) $id)->sort()->values();
                abort_unless($givenOffers->duplicates()->isEmpty() && $quotedIds->all() === $givenOffers->all(), 422,
                    'Review every quoted supplier for each item; NONE entries do not need a compliance decision.');

                foreach ($row['offers'] as $offer) {
                    $quote = $quotes->get((int) $offer['rfq_supplier_id']);
                    abort_if($quote === null || $quote->offer_status !== 'Quoted', 422, 'A reviewed offer does not belong to this item.');

                    if ($aoc->procurement_category === 'Equipment') {
                        abort_unless($quote->twg_complies === (bool) $offer['complies'], 422,
                            'Equipment compliance must match the TWG evaluation.');
                    }

                    abort_if(! $offer['complies'] && trim((string) ($offer['remarks'] ?? '')) === '', 422,
                        'Explain why every non-compliant offer was rejected.');
                    $quote->forceFill([
                        'aoc_complies' => (bool) $offer['complies'],
                        'aoc_remarks' => $offer['remarks'] ?? null,
                    ])->save();
                }

                if (! empty($row['winning_rfq_supplier_id'])) {
                    $preferred[$itemId] = (int) $row['winning_rfq_supplier_id'];
                }
            }

            $eligible = $aoc->rfq->suppliers()->where('status', 'Replied')->with('quoteItems')->get();
            $this->rebuildItemAwards($aoc, $eligible, $preferred);
        });

        $this->audit($request, 'AOC', 'Reviewed item awards', $aoc->rfq?->rfq_no);

        return response()->json([
            'message' => 'Item compliance and supplier awards were saved.',
            'data' => $this->format($aoc->fresh()),
        ]);
    }

    /**
     * Flowchart: "Individual rating of list of venue". Each rater scores every venue on every
     * criterion (1-5). When the last rater submits, the "Summary of rating" is worked out and the
     * top-rated venue becomes the winning supplier.
     */
    public function rateVenues(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        abort_unless($aoc->status === 'For Venue Rating', 422, 'This Abstract of Canvass is not awaiting venue ratings.');
        $user = $request->user();
        $setup = $aoc->venue_rating_summary ?? [];
        $rater = collect($setup['raters'] ?? [])->firstWhere('id', $user?->id);
        abort_if($rater === null, 403, 'Only the designated raters (TWG Lead, end-user, Supply Officer) may rate these venues.');
        abort_if($aoc->venueRatings()->where('rater_id', $user->id)->exists(), 422, 'You have already rated these venues.');

        $data = $request->validate([
            'ratings' => ['required', 'array', 'min:1'],
            'ratings.*.rfq_supplier_id' => ['required', 'integer'],
            'ratings.*.criterion' => ['required', 'string'],
            'ratings.*.score' => ['required', 'integer', 'between:1,5'],
            'ratings.*.remarks' => ['nullable', 'string', 'max:1000'],
        ]);

        $criteria = $setup['criteria'] ?? [];
        $venueIds = array_map('intval', $setup['venue_ids'] ?? []);
        $given = collect($data['ratings'])->map(fn (array $r) => ((int) $r['rfq_supplier_id']).'|'.$r['criterion']);
        $expected = collect($venueIds)->crossJoin($criteria)->map(fn (array $pair) => $pair[0].'|'.$pair[1]);
        abort_unless($given->duplicates()->isEmpty() && $given->sort()->values()->all() === $expected->sort()->values()->all(),
            422, 'Score every venue on every criterion, once each.');

        DB::transaction(function () use ($data, $aoc, $user, $rater): void {
            foreach ($data['ratings'] as $row) {
                VenueRating::create([
                    'abstract_of_canvas_id' => $aoc->id,
                    'rfq_supplier_id' => (int) $row['rfq_supplier_id'],
                    'rater_id' => $user->id,
                    'rater_role' => $rater['role'],
                    'criterion' => $row['criterion'],
                    'score' => (int) $row['score'],
                    'remarks' => $row['remarks'] ?? null,
                ]);
            }
        });
        $this->recordAction($request, $aoc, $rater['role'], 'Rated venues', null);

        $ratedBy = $aoc->venueRatings()->distinct()->pluck('rater_id')->all();
        $everyone = collect($setup['raters'])->pluck('id')->every(fn ($id) => in_array($id, $ratedBy, false));
        if (! $everyone) {
            return response()->json(['message' => 'Your ratings were recorded. Waiting for the other raters.', 'data' => $this->format($aoc->fresh())]);
        }

        $this->summarizeVenueRatings($aoc);
        foreach (array_filter([$aoc->creator, $this->designatedSupplyOfficer()]) as $watcher) {
            $this->notify($watcher, 'aoc_venue_rated', 'Venue ratings complete',
                "Every rater has scored the venues for {$aoc->rfq->rfq_no}. Review the summary of rating and submit the AOC for BAC review.",
                "/aoc/{$aoc->id}", ['aocId' => $aoc->id]);
        }

        return response()->json(['message' => 'All ratings are in. The summary of rating is ready.', 'data' => $this->format($aoc->fresh())]);
    }

    public function submitForBacReview(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($aoc->status === 'Draft', 422, 'This Abstract of Canvass is not awaiting submission.');
        $aoc->loadMissing(['rfq.items', 'itemAwards']);
        abort_unless($aoc->itemAwards->count() === $aoc->rfq->items->count()
            && $aoc->itemAwards->every(fn ($award) => $award->winning_rfq_supplier_id !== null),
            422, 'Every item needs a compliant winning supplier before BAC review.');
        $this->requireSignature($request->user());

        $aoc->forceFill(['status' => 'Pending BAC Review', 'submitted_at' => now()])->save();
        $this->recordAction($request, $aoc, 'Supply', 'Submitted for BAC Review', null);
        $this->notifyBac($aoc, 'Abstract of Canvass awaiting BAC review', "The Abstract of Canvass for {$aoc->rfq?->rfq_no} was submitted and is waiting for your review.");

        return response()->json(['message' => 'Abstract of Canvass submitted for BAC review.', 'data' => $this->format($aoc->fresh())]);
    }

    /** Flowchart: "BAC Review (Digital-sign) -> Fail?". */
    /**
     * The BAC's review. Returning it with remarks is the Chairman's or Vice-Chairman's call. Passing
     * it means the BAC signed the AOC on paper: it goes through with the scan of the signed AOC
     * attached — uploaded by the BAC Chairman/Vice-Chairman, or by the Supply team for the BAC.
     */
    public function bacReview(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $data = $request->validate([
            'pass' => ['required', 'boolean'],
            'remarks' => ['required_if:pass,false', 'nullable', 'string'],
        ]);
        $user = $request->user();
        $designated = collect([$this->designatedBacChair(), $this->designatedBacViceChair()])->filter()->pluck('id');
        $isBac = $user?->tier === 'superadmin' || ($user !== null && $designated->contains($user->id));

        if ($isBac || ! $data['pass']) {
            $this->guardModule('approvals');
            $this->abortUnlessBacMember($user);
        }
        $onBehalf = $this->abortUnlessSignatoryOrSupply($user, $isBac, 'BAC Chairman or Vice-Chairman');
        abort_unless($aoc->status === 'Pending BAC Review', 422, 'This Abstract of Canvass is not awaiting BAC review.');
        $this->requireSignature($user);

        if ($data['pass']) {
            $scan = $this->signedCopyFile($request);
            // "Fail? No" returns the approved AOC to Supply for final award confirmation.
            $aoc->forceFill(['status' => 'For Supply Noting', 'bac_remarks' => null, 'bac_approved_at' => now()])->save();
            $this->storeSignedCopy($request, $aoc, 'aoc_bac_passed', 'Bids and Awards Committee', $scan, $onBehalf);
            $this->recordAction($request, $aoc, 'BAC', 'Approved', $this->onBehalfNote($request, $onBehalf, 'BAC', $request->input('remarks')));

            foreach (array_filter([$this->designatedSupplyOfficer(), $aoc->creator]) as $recipient) {
                $this->notify($recipient, 'aoc_approved', 'Abstract of Canvass approved — confirm item awards',
                    "The BAC approved the AOC for {$aoc->rfq->rfq_no}. It is back with Supply to confirm the item awards; the Purchase Orders will then be created automatically.",
                    "/aoc/{$aoc->id}", ['aocId' => $aoc->id]);
            }

            return response()->json(['message' => 'Abstract of Canvass approved and returned to Supply to confirm the item awards.', 'data' => $this->format($aoc->fresh())]);
        }

        // "Fail? Yes -> Committee add remarks -> Notify TWG, End-user, Supply".
        $aoc->forceFill(['status' => 'BAC Returned', 'bac_remarks' => $data['remarks'], 'twg_response' => null])->save();
        $this->recordAction($request, $aoc, 'BAC', 'Returned with Remarks', $data['remarks']);

        $recipients = collect([$this->designatedTwgLead(), $aoc->rfq?->purchaseRequest?->requester, $this->designatedSupplyOfficer(), $aoc->creator])->filter()->unique('id');
        foreach ($recipients as $recipient) {
            $this->notify($recipient, 'aoc_returned', 'BAC returned the Abstract of Canvass',
                "BAC returned {$aoc->rfq->rfq_no}'s AOC with remarks: {$data['remarks']}", "/aoc/{$aoc->id}", ['aocId' => $aoc->id]);
        }

        return response()->json(['message' => 'Abstract of Canvass returned with remarks.', 'data' => $this->format($aoc->fresh())]);
    }

    /** Flowchart: "TWG address BAC remarks", which goes to "BAC satisfied?". */
    public function twgRespond(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($aoc->status === 'BAC Returned', 422, 'This Abstract of Canvass is not awaiting a TWG response.');

        $twg = $this->designatedTwgLead();
        $user = $request->user();
        $ok = $user?->tier === 'superadmin' || ($twg !== null && $twg->id === $user?->id);
        abort_unless($ok, 403, 'Only the designated TWG Lead may respond to BAC remarks.');

        $data = $request->validate(['response' => ['required', 'string']]);

        $aoc->forceFill(['status' => 'Pending BAC Satisfaction', 'twg_response' => $data['response']])->save();
        $this->recordAction($request, $aoc, 'TWG', 'Responded to Remarks', $data['response']);
        $this->notifyBac($aoc, 'TWG addressed the BAC remarks', "The TWG responded to the BAC remarks on {$aoc->rfq?->rfq_no}'s AOC. Decide whether the BAC is satisfied.");

        return response()->json(['message' => 'Response submitted; the BAC now decides whether it is satisfied.', 'data' => $this->format($aoc->fresh())]);
    }

    /**
     * Flowchart: "BAC satisfied?". Yes -> back to BAC Review (a fresh signed pass/fail review).
     * No -> Cancel PR -> Notify end-user to Re-PR.
     */
    public function bacSatisfaction(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardModule('approvals');
        $this->abortUnlessBacMember($request->user());
        abort_unless($aoc->status === 'Pending BAC Satisfaction', 422, 'This Abstract of Canvass is not awaiting the BAC\'s decision on the TWG response.');
        $this->requireSignature($request->user());

        $data = $request->validate([
            'satisfied' => ['required', 'boolean'],
            'reason' => ['required_if:satisfied,false', 'nullable', 'string'],
        ], ['reason.required_if' => 'Give the reason the BAC is not satisfied — it is sent to the end-user with the cancellation.']);

        if ($data['satisfied']) {
            $aoc->forceFill(['status' => 'Pending BAC Review'])->save();
            $this->recordAction($request, $aoc, 'BAC', 'Satisfied with TWG response', $data['reason'] ?? null);

            return response()->json(['message' => 'The BAC is satisfied. The AOC is back for BAC review.', 'data' => $this->format($aoc->fresh())]);
        }

        $this->recordAction($request, $aoc, 'BAC', 'Not satisfied — cancelled', $data['reason']);
        $purchaseRequest = $aoc->rfq?->purchaseRequest;
        if ($purchaseRequest) {
            $this->cancelPurchaseRequest($request, $purchaseRequest, $data['reason'], 'AOC');
        } else {
            $aoc->forceFill(['status' => 'Cancelled'])->save();
        }

        return response()->json(['message' => 'The BAC is not satisfied. The Purchase Request was cancelled and the end-user asked to Re-PR.', 'data' => $this->format($aoc->fresh())]);
    }

    /** Supply confirms the approved item awards; one Draft PO per awarded supplier is created immediately. */
    public function noteLowestBidder(Request $request, AbstractOfCanvas $aoc, CreatePurchaseOrdersFromAoc $poCreator): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($aoc->status === 'For Supply Noting', 422, 'This Abstract of Canvass is not waiting for Supply to note the item awards.');
        $user = $request->user();
        $officer = $this->designatedSupplyOfficer();
        abort_unless($user?->tier === 'superadmin' || ($officer !== null && $officer->id === $user?->id), 403, 'Only the designated Supply Officer may note the item awards.');
        $this->requireSignature($user);
        $aoc->loadMissing(['rfq.items', 'itemAwards.winningSupplier']);
        abort_unless($aoc->itemAwards->count() === $aoc->rfq->items->count()
            && $aoc->itemAwards->every(fn ($award) => $award->winning_rfq_supplier_id !== null),
            422, 'Every item must have a winning supplier.');

        $winnerNames = $aoc->itemAwards->pluck('winningSupplier.supplier_name')->filter()->unique()->values();
        $orders = DB::transaction(function () use ($aoc, $user, $poCreator): Collection {
            $aoc->forceFill([
                'status' => 'Lowest Bidder Noted',
                'supply_noted_by' => $user->id,
                'supply_noted_name' => $user->name,
                'supply_noted_at' => now(),
            ])->save();

            return $poCreator->create($aoc->fresh(), $user->id);
        });
        $this->recordAction($request, $aoc, 'Supply Officer', 'Noted item awards', $winnerNames->implode(', '));
        foreach ($orders as $po) {
            $this->audit($request, 'PO', 'Automatically generated PO', $po->po_no);
        }

        if ($aoc->creator && $aoc->creator->id !== $user->id) {
            $this->notify($aoc->creator, 'aoc_noted', 'Item awards noted — Purchase Orders created',
                "Supply confirmed the item awards for {$aoc->rfq->rfq_no}. {$orders->count()} Draft Purchase Order(s) were created automatically.",
                '/po', ['aocId' => $aoc->id, 'poIds' => $orders->pluck('id')->all()]);
        }

        return response()->json([
            'message' => "Item awards noted. {$orders->count()} Draft Purchase Order(s) created automatically.",
            'purchase_orders' => $orders->map(fn ($po) => ['id' => $po->id, 'po_no' => $po->po_no, 'supplier_name' => $po->supplier_name]),
            'data' => $this->format($aoc->fresh()),
        ]);
    }

    // --- helpers ---

    /**
     * Builds one award per RFQ item. The lowest compliant quoted unit price wins by default; Supply
     * may explicitly choose another compliant offer and the exception is preserved as the reason.
     *
     * @param  Collection<int, RfqSupplier>  $suppliers
     * @param  array<int, int>  $preferredByItem
     */
    private function rebuildItemAwards(AbstractOfCanvas $aoc, Collection $suppliers, array $preferredByItem = []): void
    {
        $aoc->loadMissing('rfq.items');
        if ($aoc->procurement_category === 'Equipment') {
            $suppliers = $suppliers->where('twg_result', 'Passed')->values();
        }

        $supplierIds = $suppliers->pluck('id')->map(fn ($id) => (int) $id);
        foreach ($aoc->rfq->items as $item) {
            $offers = RfqQuoteItem::query()
                ->where('rfq_item_id', $item->id)
                ->whereIn('rfq_supplier_id', $supplierIds)
                ->where('offer_status', 'Quoted')
                ->where('aoc_complies', true)
                ->orderBy('unit_price')
                ->orderBy('rfq_supplier_id')
                ->get();

            abort_if($offers->isEmpty(), 422, "Item {$item->item_no} has no compliant supplier quotation.");
            $cheapest = $offers->first();
            $selected = isset($preferredByItem[$item->id])
                ? $offers->firstWhere('rfq_supplier_id', $preferredByItem[$item->id])
                : $cheapest;
            abort_if($selected === null, 422, "The selected supplier for item {$item->item_no} did not submit a compliant quotation.");

            $aoc->itemAwards()->updateOrCreate(
                ['rfq_item_id' => $item->id],
                [
                    'winning_rfq_supplier_id' => $selected->rfq_supplier_id,
                    'awarded_unit_price' => $selected->unit_price,
                    'awarded_total_price' => $selected->total_price,
                    'selection_reason' => $selected->id === $cheapest->id
                        ? 'Lowest compliant quotation for this item.'
                        : 'Supply selected another compliant quotation.',
                ],
            );
        }

        $this->syncAggregateWinners($aoc);
    }

    /** Keeps legacy winner fields useful: one supplier only when that supplier won every line. */
    private function syncAggregateWinners(AbstractOfCanvas $aoc): void
    {
        $winnerIds = $aoc->itemAwards()->whereNotNull('winning_rfq_supplier_id')
            ->pluck('winning_rfq_supplier_id')->unique()->values();
        $aoc->forceFill(['winning_rfq_supplier_id' => $winnerIds->count() === 1 ? $winnerIds->first() : null])->save();
        $aoc->rfq?->suppliers()->update(['is_winner' => false]);
        if ($winnerIds->isNotEmpty()) {
            $aoc->rfq?->suppliers()->whereIn('id', $winnerIds)->update(['is_winner' => true]);
        }
    }

    /** @return array<int, string> */
    private function venueCriteria(): array
    {
        return collect(explode(',', (string) $this->preferenceValue('venue_rating_criteria', '')))
            ->map(fn (string $c) => trim($c))->filter()->unique()->values()->all();
    }

    /** The exact five-person BAC block is frozen with the AOC instead of re-reading future Settings. */
    private function signatorySnapshot(): array
    {
        $person = fn (?User $user, string $fallback): ?array => $user
            ? ['name' => $user->name, 'position' => $user->position ?: $fallback]
            : null;
        $chair = $this->designatedBacChair();
        $vice = $this->designatedBacViceChair();
        $members = User::query()
            ->where('status', 'Active')
            ->whereHas('roles', fn ($q) => $q->where('name', 'BAC Member'))
            ->whereNotIn('id', array_filter([$chair?->id, $vice?->id]))
            ->orderBy('name')
            ->limit(3)
            ->get()
            ->values()
            ->map(fn (User $user, int $index) => [
                'name' => $user->name,
                'position' => $user->position ?: 'BAC Member '.($index + 1),
            ])->all();

        return [
            'bac_chair' => $person($chair, 'Chairman, BAC'),
            'bac_vice_chair' => $person($vice, 'Vice-Chairman, BAC'),
            'bac_members' => $members,
            'twg_lead' => $person($this->designatedTwgLead(), 'TWG Lead'),
            'supply_officer' => $person($this->designatedSupplyOfficer(), 'Supply Officer'),
            'regional_director' => $person($this->designatedRegionalDirector(), 'Regional Director'),
        ];
    }

    /**
     * Default raters: the TWG Lead, the end-user (PR requester), and the Supply Officer. One person
     * holding several of these roles rates once.
     *
     * @return array<int, array{id: int, name: string, role: string}>
     */
    private function venueRaters(Rfq $rfq): array
    {
        $raters = [];
        $candidates = [
            'TWG Lead' => $this->designatedTwgLead(),
            'End-user' => $rfq->purchaseRequest?->requester,
            'Supply Officer' => $this->designatedSupplyOfficer(),
        ];
        foreach ($candidates as $role => $user) {
            if (! $user) {
                continue;
            }
            if (isset($raters[$user->id])) {
                $raters[$user->id]['role'] .= ' / '.$role;
            } else {
                $raters[$user->id] = ['id' => $user->id, 'name' => $user->name, 'role' => $role];
            }
        }

        return array_values($raters);
    }

    /** Flowchart: "Summary of rating". Highest average wins; the lower total quote breaks a tie. */
    private function summarizeVenueRatings(AbstractOfCanvas $aoc): void
    {
        $setup = $aoc->venue_rating_summary;
        $ratings = $aoc->venueRatings()->get();
        $venues = RfqSupplier::with('quoteItems')->whereIn('id', $setup['venue_ids'])->get();

        $rows = $venues->map(function (RfqSupplier $venue) use ($ratings, $setup): array {
            $mine = $ratings->where('rfq_supplier_id', $venue->id);
            $byCriterion = collect($setup['criteria'])->mapWithKeys(fn (string $c) => [$c => round((float) $mine->where('criterion', $c)->avg('score'), 2)]);

            return [
                'rfq_supplier_id' => $venue->id,
                'supplier_name' => $venue->supplier_name,
                'total_quoted' => round($venue->quoteItems->sum(fn ($qi) => (float) $qi->total_price), 2),
                'criteria' => $byCriterion->all(),
                'overall' => round($byCriterion->avg(), 2),
            ];
        })->sort(fn (array $a, array $b) => [$b['overall'], $a['total_quoted']] <=> [$a['overall'], $b['total_quoted']])->values()
            ->map(fn (array $row, int $i) => $row + ['rank' => $i + 1]);

        $winner = $venues->firstWhere('id', $rows->first()['rfq_supplier_id']);
        DB::transaction(function () use ($aoc, $setup, $rows, $winner, $venues): void {
            $aoc->forceFill([
                'venue_rating_summary' => $setup + ['venues' => $rows->all(), 'completed_at' => now()->toISOString()],
                'status' => 'Draft',
            ])->save();
            $preferred = $aoc->rfq->items()->pluck('id')->mapWithKeys(fn ($id) => [(int) $id => $winner->id])->all();
            $this->rebuildItemAwards($aoc, $venues, $preferred);
        });
    }

    private function guardRfqOrApprovals(): void
    {
        $user = request()->user();
        abort_unless($user?->canAccessModule('rfq') || $user?->canAccessModule('approvals'), 403, 'You do not have access to this module.');
    }

    /** RFQ/approvals staff see every AOC; a venue rater (e.g. the end-user) sees the one they rate. */
    private function guardViewer(Request $request, AbstractOfCanvas $aoc): void
    {
        $user = $request->user();
        $isRater = collect($aoc->venue_rating_summary['raters'] ?? [])->contains('id', $user?->id);
        abort_unless($isRater || $user?->canAccessModule('rfq') || $user?->canAccessModule('approvals'), 403, 'You do not have access to this module.');
    }

    /** Only the Settings-designated BAC Chairman or Vice-Chairman may review an AOC. */
    private function abortUnlessBacMember(?User $user): void
    {
        $designated = collect([$this->designatedBacChair(), $this->designatedBacViceChair()])->filter()->pluck('id');
        $ok = $user?->tier === 'superadmin' || ($user !== null && $designated->contains($user->id));
        abort_unless($ok, 403, 'Only the designated BAC Chairman or Vice-Chairman may review this Abstract of Canvass.');
    }

    private function notifyBac(AbstractOfCanvas $aoc, string $title, string $body): void
    {
        $recipients = collect([$this->designatedBacChair(), $this->designatedBacViceChair()])->filter()->unique('id');
        foreach ($recipients as $recipient) {
            $this->notify($recipient, 'aoc_pending_bac_review', $title, $body, "/aoc/{$aoc->id}", ['aocId' => $aoc->id]);
        }
    }

    /** Lightweight row for the BAC review queue. */
    private function formatSummary(AbstractOfCanvas $aoc): array
    {
        $aoc->loadMissing('itemAwards.winningSupplier');
        $winnerNames = $aoc->itemAwards->pluck('winningSupplier.supplier_name')->filter()->unique()->values();

        return [
            'id' => $aoc->id,
            'rfq_id' => $aoc->rfq_id,
            'rfq_no' => $aoc->rfq?->rfq_no,
            'pr_no' => $aoc->rfq?->purchaseRequest?->pr_no,
            'procurement_category' => $aoc->procurement_category,
            'status' => $aoc->status,
            'winning_supplier_name' => $winnerNames->implode(', '),
            'winning_total' => $aoc->itemAwards->sum(fn ($award) => (float) $award->awarded_total_price),
            'bac_remarks' => $aoc->bac_remarks,
            'submitted_at' => $aoc->submitted_at?->toISOString(),
            'created_at' => $aoc->created_at?->toISOString(),
        ];
    }

    private function format(AbstractOfCanvas $aoc): array
    {
        $aoc->loadMissing([
            'rfq.suppliers.quoteItems', 'rfq.items', 'rfq.purchaseRequest', 'rfq.purchaseOrders',
            'winningSupplier', 'itemAwards.rfqItem', 'itemAwards.winningSupplier',
            'creator.roles', 'approvalActions', 'venueRatings',
        ]);
        $user = request()->user();
        $setup = $aoc->venue_rating_summary;
        $ratedBy = $aoc->venueRatings->pluck('rater_id')->unique();
        $winnerNames = $aoc->itemAwards->pluck('winningSupplier.supplier_name')->filter()->unique()->values();

        return [
            'id' => $aoc->id,
            'rfq_id' => $aoc->rfq_id,
            'rfq_no' => $aoc->rfq?->rfq_no,
            'pr_no' => $aoc->rfq?->purchaseRequest?->pr_no,
            'purchase_request_id' => $aoc->rfq?->purchase_request_id,
            'procurement_category' => $aoc->procurement_category,
            'twg_evaluation_notes' => $aoc->twg_evaluation_notes,
            'winning_rfq_supplier_id' => $aoc->winning_rfq_supplier_id,
            'winning_supplier_name' => $aoc->winningSupplier?->supplier_name,
            'winning_supplier_names' => $winnerNames,
            'status' => $aoc->status,
            'prepared_by' => $this->preparedBy($aoc->creator),
            'bac_remarks' => $aoc->bac_remarks,
            'twg_response' => $aoc->twg_response,
            'submitted_at' => $aoc->submitted_at?->toISOString(),
            'bac_approved_at' => $aoc->bac_approved_at?->toISOString(),
            'supply_noted_name' => $aoc->supply_noted_name,
            'supply_noted_at' => $aoc->supply_noted_at?->toISOString(),
            'has_purchase_order' => $aoc->rfq?->purchaseOrders()->exists() ?? false,
            'suppliers' => $aoc->rfq?->suppliers->map(fn (RfqSupplier $s) => [
                'id' => $s->id,
                'supplier_name' => $s->supplier_name,
                'supplier_address' => $s->supplier_address,
                'status' => $s->status,
                'is_winner' => $s->is_winner,
                'twg_result' => $s->twg_result,
                'total_quoted' => $s->quoteItems->sum(fn ($qi) => (float) $qi->total_price),
                'quote_items' => $s->quoteItems->map(fn ($qi) => [
                    'rfq_item_id' => $qi->rfq_item_id,
                    'unit_price' => $qi->unit_price,
                    'total_price' => $qi->total_price,
                    'offer_status' => $qi->offer_status,
                    'aoc_complies' => $qi->aoc_complies,
                    'aoc_remarks' => $qi->aoc_remarks,
                    'twg_complies' => $qi->twg_complies,
                    'twg_remarks' => $qi->twg_remarks,
                ]),
            ]),
            'items' => $aoc->rfq?->items,
            'awards' => $aoc->itemAwards->sortBy(fn ($award) => $award->rfqItem?->item_no)->values()->map(fn ($award) => [
                'rfq_item_id' => $award->rfq_item_id,
                'winning_rfq_supplier_id' => $award->winning_rfq_supplier_id,
                'winning_supplier_name' => $award->winningSupplier?->supplier_name,
                'awarded_unit_price' => $award->awarded_unit_price,
                'awarded_total_price' => $award->awarded_total_price,
                'selection_reason' => $award->selection_reason,
            ]),
            'venue_rating' => $setup === null ? null : [
                'criteria' => $setup['criteria'] ?? [],
                'venue_ids' => $setup['venue_ids'] ?? [],
                'raters' => collect($setup['raters'] ?? [])->map(fn (array $r) => $r + ['rated' => $ratedBy->contains($r['id'])])->all(),
                'summary' => $setup['venues'] ?? null,
                'my_turn' => $aoc->status === 'For Venue Rating'
                    && collect($setup['raters'] ?? [])->contains('id', $user?->id)
                    && ! $ratedBy->contains($user?->id),
                'ratings' => $aoc->venueRatings->map(fn (VenueRating $r) => $r->only(['rfq_supplier_id', 'rater_id', 'rater_role', 'criterion', 'score', 'remarks'])),
            ],
            'signed_copies' => $this->signedCopiesOf($aoc),
            'approval_trail' => $aoc->approvalActions,
            'purchase_orders' => $aoc->rfq?->purchaseOrders->sortBy('id')->values()->map(fn ($po) => [
                'id' => $po->id,
                'po_no' => $po->po_no,
                'supplier_name' => $po->supplier_name,
                'total_amount' => $po->total_amount,
                'status' => $po->status,
            ]),
            // For the printed Abstract of Canvass: the RFQ's particulars and every signature line.
            'document' => $this->documentDetails($aoc),
            'created_at' => $aoc->created_at?->toISOString(),
        ];
    }

    /**
     * What the printed Abstract of Canvass needs beyond the prices: the RFQ/PR particulars and the
     * signatories — the BAC (Chairman, Vice-Chairman, members), the TWG Lead for equipment, the
     * Supply Officer who confirms the item awards, and the Regional Director who approves.
     *
     * @return array<string, mixed>
     */
    private function documentDetails(AbstractOfCanvas $aoc): array
    {
        $rfq = $aoc->rfq;
        $pr = $rfq?->purchaseRequest;
        $signatories = $aoc->signatory_snapshot ?: $this->signatorySnapshot();
        if ($aoc->procurement_category !== 'Equipment') {
            $signatories['twg_lead'] = null;
        }

        return [
            'quotation_no' => $rfq?->quotation_no,
            'rfq_date' => $rfq?->rfq_date,
            'opening_date' => $rfq?->opening_date,
            'place_of_delivery' => $rfq?->place_of_delivery,
            'estimated_budget' => (float) ($rfq?->estimated_budget ?? 0),
            'purpose' => $rfq?->purpose ?? $pr?->purpose,
            'fund_source' => $rfq?->fund_source_snapshot,
            'mode_of_procurement' => $pr?->mode_of_procurement,
            'pr_date' => $pr?->created_at?->toDateString(),
            'notes' => $rfq?->notes,
            'signatories' => $signatories,
        ];
    }
}
