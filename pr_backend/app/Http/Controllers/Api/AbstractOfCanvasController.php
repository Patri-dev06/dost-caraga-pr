<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\CancelsPurchaseRequests;
use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Controller;
use App\Models\AbstractOfCanvas;
use App\Models\Rfq;
use App\Models\RfqSupplier;
use App\Models\User;
use App\Models\VenueRating;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The Abstract of Canvas, from "Generate Abstract of Canvas (AOC)" through the orange BAC lane to
 * "AOC returned to supply to note lowest bidder":
 *
 *   Goods     -> Generate AOC -> BAC Review
 *   Equipment -> (TWG checks on the RFQ) -> Generate AOC from the suppliers that passed -> BAC Review
 *   Venue     -> Generate AOC -> Individual rating of each venue -> Summary of rating -> BAC Review
 *
 *   BAC Review (digital sign) -> Fail? Yes -> remarks, notify TWG/end-user/Supply -> TWG addresses remarks
 *        -> BAC satisfied? Yes -> BAC Review again | No -> Cancel PR -> Re-PR
 *                             No  -> For Supply Noting -> Lowest Bidder Noted -> Create PO
 */
class AbstractOfCanvasController extends Controller
{
    use CancelsPurchaseRequests;
    use HasProcurementHelpers;

    public function generate(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        abort_if($rfq->abstractOfCanvas()->exists(), 422, 'An Abstract of Canvas has already been generated for this RFQ.');
        abort_if(in_array($rfq->status, ['Cancelled', 'Draft', 'Pending Supply Officer Countersign', 'Pending BAC Signature', 'Ready to Send'], true), 422, 'This RFQ has not been canvassed.');

        $unresolved = $rfq->suppliers()->whereIn('status', ['Pending', 'Sent'])->exists();
        abort_if($unresolved, 422, 'Every canvassed supplier must have replied or had its RFQ cancelled before generating the Abstract of Canvas.');

        $replied = $rfq->suppliers()->where('status', 'Replied')->with('quoteItems')->get();
        abort_if($replied->isEmpty(), 422, 'At least one supplier must have replied with a quotation.');

        $data = $request->validate(['twg_evaluation_notes' => ['nullable', 'string']]);
        $category = $rfq->procurement_category;

        if ($category === 'Equipment') {
            abort_unless($rfq->status === 'TWG Evaluation', 422, 'The TWG must evaluate the equipment before the Abstract of Canvas is generated.');
            if (! empty($data['twg_evaluation_notes'])) {
                $rfq->forceFill(['twg_evaluation_notes' => $data['twg_evaluation_notes']])->save();
            }
            abort_if(empty($rfq->twg_evaluation_notes), 422, 'TWG evaluation notes are required for Equipment procurement before generating the Abstract of Canvas.');
            abort_if($replied->contains(fn (RfqSupplier $s) => $s->twg_result === null), 422, 'The TWG must check each supplier\'s equipment first.');
            $replied = $replied->where('twg_result', 'Passed')->values();
            abort_if($replied->isEmpty(), 422, 'No supplier passed the TWG check. Choose new suppliers to canvass.');
        }

        $winner = $category === 'Venue' ? null : $this->lowestBidder($replied);
        $criteria = $category === 'Venue' ? $this->venueCriteria() : [];
        $raters = $category === 'Venue' ? $this->venueRaters($rfq) : [];
        abort_if($category === 'Venue' && ($criteria === [] || $raters === []), 422, 'Set the venue rating criteria and the TWG Lead / Supply Officer in Settings first.');

        $aoc = DB::transaction(function () use ($rfq, $winner, $request, $category, $criteria, $raters, $replied): AbstractOfCanvas {
            $aoc = AbstractOfCanvas::create([
                'rfq_id' => $rfq->id,
                'procurement_category' => $category,
                'twg_evaluation_notes' => $rfq->twg_evaluation_notes,
                'winning_rfq_supplier_id' => $winner?->id,
                'status' => $category === 'Venue' ? 'For Venue Rating' : 'Draft',
                'venue_rating_summary' => $category === 'Venue' ? [
                    'criteria' => $criteria,
                    'raters' => $raters,
                    'venue_ids' => $replied->pluck('id')->all(),
                ] : null,
                'created_by' => $request->user()->id,
            ]);
            $winner?->forceFill(['is_winner' => true])->save();

            return $aoc;
        });

        $this->audit($request, 'AOC', 'Generated Abstract of Canvas', $rfq->rfq_no);

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

        $query = AbstractOfCanvas::with(['rfq.purchaseRequest', 'winningSupplier.quoteItems'])->latest('id');

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
        $pending = AbstractOfCanvas::with(['rfq.purchaseRequest', 'winningSupplier.quoteItems'])
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
     * Flowchart: "Individual rating of list of venue". Each rater scores every venue on every
     * criterion (1-5). When the last rater submits, the "Summary of rating" is worked out and the
     * top-rated venue becomes the winning supplier.
     */
    public function rateVenues(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        abort_unless($aoc->status === 'For Venue Rating', 422, 'This Abstract of Canvas is not awaiting venue ratings.');
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
        abort_unless($aoc->status === 'Draft', 422, 'This Abstract of Canvas is not awaiting submission.');
        $this->requireSignature($request->user());

        $aoc->forceFill(['status' => 'Pending BAC Review', 'submitted_at' => now()])->save();
        $this->recordAction($request, $aoc, 'Supply', 'Submitted for BAC Review', null);
        $this->notifyBac($aoc, 'Abstract of Canvas awaiting BAC review', "The Abstract of Canvas for {$aoc->rfq?->rfq_no} was submitted and is waiting for your review.");

        return response()->json(['message' => 'Abstract of Canvas submitted for BAC review.', 'data' => $this->format($aoc->fresh())]);
    }

    /** Flowchart: "BAC Review (Digital-sign) -> Fail?". */
    public function bacReview(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardModule('approvals');
        $this->abortUnlessBacMember($request->user());
        abort_unless($aoc->status === 'Pending BAC Review', 422, 'This Abstract of Canvas is not awaiting BAC review.');
        $this->requireSignature($request->user());

        $data = $request->validate([
            'pass' => ['required', 'boolean'],
            'remarks' => ['required_if:pass,false', 'nullable', 'string'],
        ]);

        if ($data['pass']) {
            // "Fail? No -> AOC returned to supply to note lowest bidder".
            $aoc->forceFill(['status' => 'For Supply Noting', 'bac_remarks' => null, 'bac_approved_at' => now()])->save();
            $this->recordAction($request, $aoc, 'BAC', 'Approved', $request->input('remarks'));

            foreach (array_filter([$this->designatedSupplyOfficer(), $aoc->creator]) as $recipient) {
                $this->notify($recipient, 'aoc_approved', 'Abstract of Canvas approved — note the lowest bidder',
                    "The BAC approved the AOC for {$aoc->rfq->rfq_no}. It is back with Supply to note the lowest bidder before the Purchase Order is made.",
                    "/aoc/{$aoc->id}", ['aocId' => $aoc->id]);
            }

            return response()->json(['message' => 'Abstract of Canvas approved and returned to Supply to note the lowest bidder.', 'data' => $this->format($aoc->fresh())]);
        }

        // "Fail? Yes -> Committee add remarks -> Notify TWG, End-user, Supply".
        $aoc->forceFill(['status' => 'BAC Returned', 'bac_remarks' => $data['remarks'], 'twg_response' => null])->save();
        $this->recordAction($request, $aoc, 'BAC', 'Returned with Remarks', $data['remarks']);

        $recipients = collect([$this->designatedTwgLead(), $aoc->rfq?->purchaseRequest?->requester, $this->designatedSupplyOfficer(), $aoc->creator])->filter()->unique('id');
        foreach ($recipients as $recipient) {
            $this->notify($recipient, 'aoc_returned', 'BAC returned the Abstract of Canvas',
                "BAC returned {$aoc->rfq->rfq_no}'s AOC with remarks: {$data['remarks']}", "/aoc/{$aoc->id}", ['aocId' => $aoc->id]);
        }

        return response()->json(['message' => 'Abstract of Canvas returned with remarks.', 'data' => $this->format($aoc->fresh())]);
    }

    /** Flowchart: "TWG address BAC remarks", which goes to "BAC satisfied?". */
    public function twgRespond(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($aoc->status === 'BAC Returned', 422, 'This Abstract of Canvas is not awaiting a TWG response.');

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
        abort_unless($aoc->status === 'Pending BAC Satisfaction', 422, 'This Abstract of Canvas is not awaiting the BAC\'s decision on the TWG response.');
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

    /** Flowchart: "AOC returned to supply to note lowest bidder" — the Supply Officer confirms it and signs. */
    public function noteLowestBidder(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($aoc->status === 'For Supply Noting', 422, 'This Abstract of Canvas is not waiting for Supply to note the lowest bidder.');
        $user = $request->user();
        $officer = $this->designatedSupplyOfficer();
        abort_unless($user?->tier === 'superadmin' || ($officer !== null && $officer->id === $user?->id), 403, 'Only the designated Supply Officer may note the lowest bidder.');
        $this->requireSignature($user);
        abort_if($aoc->winning_rfq_supplier_id === null, 422, 'No winning supplier is recorded on this Abstract of Canvas.');

        $aoc->forceFill([
            'status' => 'Lowest Bidder Noted',
            'supply_noted_by' => $user->id,
            'supply_noted_name' => $user->name,
            'supply_noted_at' => now(),
        ])->save();
        $this->recordAction($request, $aoc, 'Supply Officer', 'Noted lowest bidder', $aoc->winningSupplier?->supplier_name);

        if ($aoc->creator && $aoc->creator->id !== $user->id) {
            $this->notify($aoc->creator, 'aoc_noted', 'Lowest bidder noted — create the Purchase Order',
                "Supply noted {$aoc->winningSupplier?->supplier_name} as the winning bidder for {$aoc->rfq->rfq_no}. You may now create the Purchase Order.",
                '/po', ['aocId' => $aoc->id]);
        }

        return response()->json(['message' => 'Lowest bidder noted. The Purchase Order can now be created.', 'data' => $this->format($aoc->fresh())]);
    }

    // --- helpers ---

    /** @param  Collection<int, RfqSupplier>  $suppliers */
    private function lowestBidder(Collection $suppliers): RfqSupplier
    {
        return $suppliers->sortBy(fn (RfqSupplier $s) => $s->quoteItems->sum(fn ($qi) => (float) $qi->total_price))->first();
    }

    /** @return array<int, string> */
    private function venueCriteria(): array
    {
        return collect(explode(',', (string) $this->preferenceValue('venue_rating_criteria', '')))
            ->map(fn (string $c) => trim($c))->filter()->unique()->values()->all();
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
        DB::transaction(function () use ($aoc, $setup, $rows, $winner): void {
            $aoc->forceFill([
                'venue_rating_summary' => $setup + ['venues' => $rows->all(), 'completed_at' => now()->toISOString()],
                'winning_rfq_supplier_id' => $winner->id,
                'status' => 'Draft',
            ])->save();
            $winner->forceFill(['is_winner' => true])->save();
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
        abort_unless($ok, 403, 'Only the designated BAC Chairman or Vice-Chairman may review this Abstract of Canvas.');
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
        return [
            'id' => $aoc->id,
            'rfq_id' => $aoc->rfq_id,
            'rfq_no' => $aoc->rfq?->rfq_no,
            'pr_no' => $aoc->rfq?->purchaseRequest?->pr_no,
            'procurement_category' => $aoc->procurement_category,
            'status' => $aoc->status,
            'winning_supplier_name' => $aoc->winningSupplier?->supplier_name,
            'winning_total' => $aoc->winningSupplier?->quoteItems->sum(fn ($qi) => (float) $qi->total_price),
            'bac_remarks' => $aoc->bac_remarks,
            'submitted_at' => $aoc->submitted_at?->toISOString(),
            'created_at' => $aoc->created_at?->toISOString(),
        ];
    }

    private function format(AbstractOfCanvas $aoc): array
    {
        $aoc->loadMissing(['rfq.suppliers.quoteItems', 'rfq.items', 'rfq.purchaseRequest', 'winningSupplier', 'creator.roles', 'approvalActions', 'venueRatings']);
        $user = request()->user();
        $setup = $aoc->venue_rating_summary;
        $ratedBy = $aoc->venueRatings->pluck('rater_id')->unique();

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
                'status' => $s->status,
                'is_winner' => $s->is_winner,
                'twg_result' => $s->twg_result,
                'total_quoted' => $s->quoteItems->sum(fn ($qi) => (float) $qi->total_price),
                'quote_items' => $s->quoteItems->map(fn ($qi) => [
                    'rfq_item_id' => $qi->rfq_item_id,
                    'unit_price' => $qi->unit_price,
                    'total_price' => $qi->total_price,
                    'twg_complies' => $qi->twg_complies,
                    'twg_remarks' => $qi->twg_remarks,
                ]),
            ]),
            'items' => $aoc->rfq?->items,
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
            'approval_trail' => $aoc->approvalActions,
            'created_at' => $aoc->created_at?->toISOString(),
        ];
    }
}
