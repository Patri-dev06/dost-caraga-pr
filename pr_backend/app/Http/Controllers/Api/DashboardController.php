<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Controller;
use App\Models\PrMonitoringEntry;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Rfq;
use App\Models\RfqSupplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Everything the dashboard shows, counted on the server in one call: the module cards' numbers,
 * where the user's PRs are in the flow, the Supply team's follow-ups, and the latest PRs and RFQs.
 * Only counts and short capped lists — never a whole table shipped to the browser to be counted.
 */
class DashboardController extends Controller
{
    use HasProcurementHelpers;

    /** How many rows each follow-up list shows; its `total` says how many there are in all. */
    private const FOLLOW_UP_LIMIT = 6;

    public function summary(Request $request): JsonResponse
    {
        $user = $request->user();
        $visiblePrs = fn () => PurchaseRequest::visibleTo($user);

        $data = [
            'purchase_requests' => [
                'count' => $visiblePrs()->count(),
                'amount' => (float) PurchaseRequestItem::whereIn('purchase_request_id', $visiblePrs()->select('id'))
                    ->sum(DB::raw('quantity * unit_cost')),
            ],
            // The Approval Inbox's own queue: PRs waiting to be recommended or approved.
            'approvals_pending' => $user->canAccessModule('approvals')
                ? PurchaseRequest::whereIn('status', ['For Recommendation', 'For Approval'])->count()
                : null,
            'rfqs' => $user->canAccessModule('rfq') ? [
                'count' => Rfq::count(),
                'canvassing' => Rfq::where('status', 'Canvassing')->count(),
            ] : null,
            'purchase_orders' => $user->canAccessModule('po') ? [
                'count' => PurchaseOrder::count(),
                'pending' => PurchaseOrder::where('status', 'like', 'Pending%')->count(),
            ] : null,
            'stages' => collect(PurchaseRequest::STAGES)
                ->map(fn (string $label, string $key) => ['key' => $key, 'label' => $label, 'count' => $visiblePrs()->inStage($key)->count()])
                ->values(),
            'follow_ups' => $this->canEditMonitoring($user) ? $this->followUps() : null,
            'recent_purchase_requests' => $visiblePrs()->with('office')->latest('id')->limit(5)->get()
                ->map(fn (PurchaseRequest $pr) => [
                    'id' => $pr->id, 'pr_no' => $pr->pr_no, 'office' => $pr->office?->name,
                    'status' => $pr->status, 'created_at' => $pr->created_at?->toISOString(),
                ]),
            'recent_rfqs' => $user->canAccessModule('rfq')
                ? Rfq::with('purchaseRequest:id,pr_no')->latest('id')->limit(5)->get()->map(fn (Rfq $rfq) => [
                    'id' => $rfq->id, 'rfq_no' => $rfq->rfq_no, 'pr_no' => $rfq->purchaseRequest?->pr_no,
                    'status' => $rfq->status, 'created_at' => $rfq->created_at?->toISOString(),
                ])
                : [],
        ];

        return response()->json(['data' => $data]);
    }

    /**
     * What the Supply team has to chase by hand now that suppliers are contacted outside the system:
     * RFQ replies due within 2 days, signed POs still with the supplier, and deliveries due within
     * 7 days (or overdue) per the sheet's "Due date for Delivery" with no full delivery recorded.
     *
     * @return array<string, array{total: int, items: mixed}>
     */
    private function followUps(): array
    {
        $replies = RfqSupplier::where('status', 'Sent')
            ->whereNotNull('reply_due_at')
            ->where('reply_due_at', '<=', now()->addDays(2))
            ->whereHas('rfq', fn ($q) => $q->where('status', '!=', 'Cancelled'))
            ->orderBy('reply_due_at');

        $withSupplier = PurchaseOrder::where('status', 'Forwarded to Supplier')->orderBy('forwarded_to_supplier_at');

        $deliveries = PrMonitoringEntry::whereNotNull('values->delivery_due_at')
            ->where('values->delivery_due_at', '<=', now()->addDays(7)->toDateString())
            ->whereNull('values->delivered_full_at')
            ->whereHas('purchaseRequest', fn ($q) => $q->where('status', '!=', 'Cancelled'))
            ->orderBy('values->delivery_due_at');

        return [
            'rfq_replies_due' => [
                'total' => (clone $replies)->count(),
                'items' => $replies->with('rfq:id,rfq_no')->limit(self::FOLLOW_UP_LIMIT)->get()->map(fn (RfqSupplier $s) => [
                    'rfq_id' => $s->rfq_id,
                    'rfq_no' => $s->rfq?->rfq_no,
                    'supplier_name' => $s->supplier_name,
                    'contact_no' => $s->supplier_contact_no,
                    'due_at' => $s->reply_due_at?->toISOString(),
                ]),
            ],
            'pos_with_supplier' => [
                'total' => (clone $withSupplier)->count(),
                'items' => $withSupplier->limit(self::FOLLOW_UP_LIMIT)->get()->map(fn (PurchaseOrder $po) => [
                    'po_id' => $po->id,
                    'po_no' => $po->po_no,
                    'supplier_name' => $po->supplier_name,
                    'contact_no' => $po->supplier_contact_no,
                    'forwarded_at' => $po->forwarded_to_supplier_at?->toISOString(),
                ]),
            ],
            'deliveries_due' => [
                'total' => (clone $deliveries)->count(),
                'items' => $deliveries->with(['purchaseRequest:id,pr_no', 'purchaseRequest.purchaseOrders:id,purchase_request_id,po_no,supplier_name,status'])
                    ->limit(self::FOLLOW_UP_LIMIT)->get()->map(function (PrMonitoringEntry $entry) {
                        $po = $entry->purchaseRequest?->purchaseOrders->where('status', '!=', 'Cancelled')->sortByDesc('id')->first();

                        return [
                            'pr_id' => $entry->purchase_request_id,
                            'pr_no' => $entry->purchaseRequest?->pr_no,
                            'po_no' => $po?->po_no,
                            'supplier_name' => $po?->supplier_name,
                            'due_date' => $entry->values['delivery_due_at'] ?? null,
                        ];
                    }),
            ],
        ];
    }
}
