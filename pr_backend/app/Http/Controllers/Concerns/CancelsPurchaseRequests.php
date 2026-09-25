<?php

namespace App\Http\Controllers\Concerns;

use App\Models\AbstractOfCanvas;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\Rfq;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The flowchart's "Cancel PR -> Notify End-user to Re-PR", reached from two places: BAC not satisfied
 * after the TWG addressed its remarks, and the winning supplier waiving delivery. One code path for both.
 *
 * Needs HasProcurementHelpers on the same class (recordAction, notify).
 */
trait CancelsPurchaseRequests
{
    /** @param string $from 'AOC' or 'PO' — which flowchart box cancelled it */
    private function cancelPurchaseRequest(Request $request, PurchaseRequest $pr, string $reason, string $from): void
    {
        if ($pr->status === 'Cancelled') {
            return;
        }

        DB::transaction(function () use ($pr, $reason, $from): void {
            $pr->forceFill([
                'status' => 'Cancelled',
                'stage' => 'Cancelled',
                'cancelled_at' => now(),
                'cancel_reason' => $reason,
                'cancelled_from' => $from,
            ])->save();

            // Everything still open downstream of the PR goes with it.
            foreach ($pr->rfqs()->where('status', '!=', 'Cancelled')->get() as $rfq) {
                /** @var Rfq $rfq */
                $rfq->forceFill(['status' => 'Cancelled', 'stage' => 'Cancelled'])->save();
                $rfq->suppliers()->whereIn('status', ['Pending', 'Sent'])->update(['status' => 'Cancelled']);
                AbstractOfCanvas::where('rfq_id', $rfq->id)->where('status', '!=', 'Cancelled')->update(['status' => 'Cancelled']);
            }

            // An answered PO stays as it is; an open one is cancelled.
            PurchaseOrder::where('purchase_request_id', $pr->id)
                ->whereNotIn('status', PurchaseOrder::CLOSED_STATUSES)
                ->update(['status' => 'Cancelled', 'stage' => 'Cancelled']);
        });

        $this->recordAction($request, $pr, $from === 'AOC' ? 'BAC' : 'Supply', 'Cancelled PR', $reason);

        $pr->loadMissing('requester');
        $cause = $from === 'PO'
            ? 'the winning supplier waived delivery'
            : 'the BAC was not satisfied after the TWG addressed its remarks';
        $this->notify($pr->requester, 'pr_cancelled', 'Purchase Request cancelled — please Re-PR',
            "{$pr->pr_no} was cancelled because {$cause}. Reason: {$reason}\nOpen the PR and choose Re-PR to file a new one from it if the need still stands.",
            "/purchase-requests/{$pr->id}", ['prId' => $pr->id]);
    }
}
