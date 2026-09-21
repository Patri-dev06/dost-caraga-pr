<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Controller;
use App\Models\AbstractOfCanvas;
use App\Models\Rfq;
use App\Models\RfqSupplier;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AbstractOfCanvasController extends Controller
{
    use HasProcurementHelpers;

    /** Generates the AOC once all 3 canvassed suppliers have replied or been resolved. */
    public function generate(Request $request, Rfq $rfq): JsonResponse
    {
        $this->guardModule('rfq');
        abort_if($rfq->abstractOfCanvas()->exists(), 422, 'An Abstract of Canvas has already been generated for this RFQ.');
        abort_if($rfq->procurement_category === 'Venue', 422, 'Venue procurement is not yet supported.');

        $unresolved = $rfq->suppliers()->whereIn('status', ['Pending', 'Sent'])->exists();
        abort_if($unresolved, 422, 'All canvassed suppliers must have replied or been marked as timed out before generating the Abstract of Canvas.');

        $repliedSuppliers = $rfq->suppliers()->where('status', 'Replied')->with('quoteItems')->get();
        abort_if($repliedSuppliers->isEmpty(), 422, 'At least one supplier must have replied with a quotation.');

        $data = $request->validate(['twg_evaluation_notes' => ['nullable', 'string']]);
        abort_if($rfq->procurement_category === 'Equipment' && empty($data['twg_evaluation_notes']), 422,
            'TWG evaluation notes are required for Equipment procurement before generating the Abstract of Canvas.');

        $winner = $repliedSuppliers->sortBy(fn (RfqSupplier $s) => $s->quoteItems->sum(fn ($qi) => (float) $qi->total_price))->first();

        $aoc = DB::transaction(function () use ($rfq, $data, $winner, $request): AbstractOfCanvas {
            $aoc = AbstractOfCanvas::create([
                'rfq_id' => $rfq->id,
                'procurement_category' => $rfq->procurement_category,
                'twg_evaluation_notes' => $data['twg_evaluation_notes'] ?? null,
                'winning_rfq_supplier_id' => $winner->id,
                'status' => 'Draft',
                'created_by' => $request->user()->id,
            ]);

            $winner->forceFill(['is_winner' => true])->save();

            return $aoc;
        });

        $this->audit($request, 'AOC', 'Generated Abstract of Canvas', $rfq->rfq_no);

        return response()->json(['data' => $this->format($aoc->fresh())], 201);
    }

    /** Queue of Abstracts of Canvas, optionally filtered by status (comma-separated), for the BAC review inbox. */
    public function index(Request $request): JsonResponse
    {
        $this->guardRfqOrApprovals();

        $query = AbstractOfCanvas::with(['rfq.purchaseRequest', 'winningSupplier.quoteItems'])->latest('id');

        if ($request->query('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        return response()->json([
            'data' => $query->get()->map(fn (AbstractOfCanvas $aoc): array => $this->formatSummary($aoc)),
        ]);
    }

    public function show(AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardRfqOrApprovals();

        return response()->json(['data' => $this->format($aoc)]);
    }

    public function submitForBacReview(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless(in_array($aoc->status, ['Draft', 'BAC Returned'], true), 422, 'This Abstract of Canvas is not awaiting submission.');
        $this->requireSignature($request->user());

        $aoc->forceFill(['status' => 'Pending BAC Review', 'submitted_at' => now()])->save();
        $this->recordAction($request, $aoc, 'Supply', 'Submitted for BAC Review', null);
        $this->notifyBacForReview($aoc, 'submitted');

        return response()->json(['message' => 'Abstract of Canvas submitted for BAC review.', 'data' => $this->format($aoc->fresh())]);
    }

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
            $aoc->forceFill(['status' => 'Approved', 'bac_remarks' => null])->save();
            $this->recordAction($request, $aoc, 'BAC', 'Approved', $request->input('remarks'));

            if ($aoc->creator) {
                $this->notify($aoc->creator, 'aoc_approved', 'Abstract of Canvas approved',
                    "The AOC for {$aoc->rfq->rfq_no} was approved by BAC. You may now generate the Purchase Order.",
                    '/po', ['aocId' => $aoc->id]);
            }

            return response()->json(['message' => 'Abstract of Canvas approved.', 'data' => $this->format($aoc->fresh())]);
        }

        $aoc->forceFill(['status' => 'BAC Returned', 'bac_remarks' => $data['remarks']])->save();
        $this->recordAction($request, $aoc, 'BAC', 'Returned with Remarks', $data['remarks']);

        foreach (array_filter([$this->designatedTwgLead(), $aoc->creator, $aoc->rfq?->purchaseRequest?->requester]) as $recipient) {
            $this->notify($recipient, 'aoc_returned', 'BAC returned the Abstract of Canvas',
                "BAC returned {$aoc->rfq->rfq_no}'s AOC with remarks: {$data['remarks']}", '/rfq', ['aocId' => $aoc->id]);
        }

        return response()->json(['message' => 'Abstract of Canvas returned with remarks.', 'data' => $this->format($aoc->fresh())]);
    }

    public function twgRespond(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardModule('rfq');
        abort_unless($aoc->status === 'BAC Returned', 422, 'This Abstract of Canvas is not awaiting a TWG response.');

        $twg = $this->designatedTwgLead();
        $user = $request->user();
        $ok = $user?->tier === 'superadmin' || ($twg !== null && $twg->id === $user?->id);
        abort_unless($ok, 403, 'Only the designated TWG Lead may respond to BAC remarks.');

        $data = $request->validate(['response' => ['required', 'string']]);

        $aoc->forceFill(['status' => 'Pending BAC Review', 'twg_response' => $data['response']])->save();
        $this->recordAction($request, $aoc, 'TWG', 'Responded to Remarks', $data['response']);
        $this->notifyBacForReview($aoc, 'resubmitted');

        return response()->json(['message' => 'Response submitted; back to BAC for review.', 'data' => $this->format($aoc->fresh())]);
    }

    /** BAC-not-satisfied terminal path: cancels the AOC and the RFQ, and tells the requester to re-submit. */
    public function cancel(Request $request, AbstractOfCanvas $aoc): JsonResponse
    {
        $this->guardModule('approvals');
        $this->abortUnlessBacMember($request->user());
        abort_unless($aoc->status === 'BAC Returned', 422, 'Only a returned Abstract of Canvas can be cancelled.');

        DB::transaction(function () use ($aoc): void {
            $aoc->forceFill(['status' => 'Cancelled'])->save();
            $aoc->rfq?->forceFill(['status' => 'Cancelled', 'stage' => 'Cancelled'])->save();
        });

        $this->recordAction($request, $aoc, 'BAC', 'Cancelled', $request->input('reason'));

        $requester = $aoc->rfq?->purchaseRequest?->requester;
        if ($requester) {
            $this->notify($requester, 'aoc_cancelled', 'Purchase cancelled by BAC',
                "{$aoc->rfq->rfq_no} was cancelled after BAC review. Please review and re-submit a new Purchase Request if the need still stands.",
                '/purchase-requests', ['prId' => $aoc->rfq->purchase_request_id]);
        }

        return response()->json(['message' => 'Abstract of Canvas and RFQ cancelled.', 'data' => $this->format($aoc->fresh())]);
    }

    private function guardRfqOrApprovals(): void
    {
        $user = request()->user();
        abort_unless($user?->canAccessModule('rfq') || $user?->canAccessModule('approvals'), 403, 'You do not have access to this module.');
    }

    /** Only the Settings-designated BAC Chairman or Vice-Chairman may review (or cancel) an AOC. */
    private function abortUnlessBacMember(?User $user): void
    {
        $designated = collect([$this->designatedBacChair(), $this->designatedBacViceChair()])->filter()->pluck('id');
        $ok = $user?->tier === 'superadmin' || ($user !== null && $designated->contains($user->id));
        abort_unless($ok, 403, 'Only the designated BAC Chairman or Vice-Chairman may review this Abstract of Canvas.');
    }

    private function notifyBacForReview(AbstractOfCanvas $aoc, string $event): void
    {
        $aoc->loadMissing('rfq');
        $recipients = collect([$this->designatedBacChair(), $this->designatedBacViceChair()])->filter()->unique('id');

        foreach ($recipients as $recipient) {
            $this->notify($recipient, 'aoc_pending_bac_review', 'Abstract of Canvas awaiting BAC review',
                "The Abstract of Canvas for {$aoc->rfq?->rfq_no} was {$event} and is waiting for your review.",
                "/aoc/{$aoc->id}", ['aocId' => $aoc->id]);
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
        $aoc->loadMissing(['rfq.suppliers.quoteItems', 'rfq.items', 'rfq.purchaseRequest', 'winningSupplier', 'creator', 'approvalActions']);

        return [
            'id' => $aoc->id,
            'rfq_id' => $aoc->rfq_id,
            'rfq_no' => $aoc->rfq?->rfq_no,
            'pr_no' => $aoc->rfq?->purchaseRequest?->pr_no,
            'procurement_category' => $aoc->procurement_category,
            'twg_evaluation_notes' => $aoc->twg_evaluation_notes,
            'winning_rfq_supplier_id' => $aoc->winning_rfq_supplier_id,
            'winning_supplier_name' => $aoc->winningSupplier?->supplier_name,
            'status' => $aoc->status,
            'bac_remarks' => $aoc->bac_remarks,
            'twg_response' => $aoc->twg_response,
            'submitted_at' => $aoc->submitted_at?->toISOString(),
            'suppliers' => $aoc->rfq?->suppliers->map(fn (RfqSupplier $s) => [
                'id' => $s->id,
                'supplier_name' => $s->supplier_name,
                'status' => $s->status,
                'is_winner' => $s->is_winner,
                'total_quoted' => $s->quoteItems->sum(fn ($qi) => (float) $qi->total_price),
            ]),
            'items' => $aoc->rfq?->items,
            'approval_trail' => $aoc->approvalActions,
            'created_at' => $aoc->created_at?->toISOString(),
        ];
    }
}
