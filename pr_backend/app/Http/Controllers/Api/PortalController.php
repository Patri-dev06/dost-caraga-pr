<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Concerns\ManagesCanvass;
use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\RfqSupplier;
use App\Support\PortalToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The public Supplier Portal. There are no supplier accounts: each link carries a token that opens
 * exactly one canvassed supplier's RFQ, or one Purchase Order, and nothing else.
 *
 * Flowchart: "Supplier receives RFQ (Supplier Portal)" -> "Supplier sends back signed quotation", and
 * "Forward signed PO to Supplier Portal" -> "Does supplier waive to deliver?".
 */
class PortalController extends Controller
{
    use HasProcurementHelpers;
    use ManagesCanvass;

    public function showRfq(string $token): JsonResponse
    {
        $rfqSupplier = $this->rfqSupplierFor($token);

        return response()->json(['data' => $this->formatRfq($rfqSupplier)]);
    }

    public function submitQuote(Request $request, string $token): JsonResponse
    {
        $rfqSupplier = $this->rfqSupplierFor($token);
        abort_unless($rfqSupplier->status === 'Sent', 422, 'Your quotation has already been received. Thank you.');
        abort_unless($rfqSupplier->rfq->status === 'Canvassing', 422, 'This Request for Quotation is no longer accepting quotations.');

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.rfq_item_id' => ['required', 'integer'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'quotation' => RfqController::QUOTATION_RULES,
        ], [
            'quotation.required' => 'Upload your signed quotation (PDF or a clear photo).',
            'quotation.mimes' => 'The signed quotation must be a PDF, JPG, or PNG file.',
            'quotation.max' => 'The signed quotation must be 10 MB or smaller.',
        ]);

        $this->storeQuote($rfqSupplier, $data['items'], $request->file('quotation'), 'Portal');

        return response()->json(['message' => 'Your quotation was received. Thank you.', 'data' => $this->formatRfq($rfqSupplier->fresh(['rfq.items', 'quoteItems']))]);
    }

    public function showPo(string $token): JsonResponse
    {
        return response()->json(['data' => $this->formatPo($this->poFor($token))]);
    }

    public function respondPo(Request $request, string $token): JsonResponse
    {
        $po = $this->poFor($token);
        abort_unless($po->status === 'Forwarded to Supplier', 422, 'Your answer for this Purchase Order has already been recorded.');

        $data = $request->validate([
            'waived' => ['required', 'boolean'],
            'reason' => ['required_if:waived,true', 'nullable', 'string', 'max:2000'],
        ], ['reason.required_if' => 'Tell us why you are waiving delivery.']);

        app(PurchaseOrderController::class)->recordDeliveryAnswer($request, $po, (bool) $data['waived'], $data['reason'] ?? null, 'Supplier (portal)');

        return response()->json([
            'message' => $data['waived'] ? 'We recorded that you waive delivery. Thank you for letting us know.' : 'Thank you. We recorded that you will deliver.',
            'data' => $this->formatPo($po->fresh()),
        ]);
    }

    private function rfqSupplierFor(string $token): RfqSupplier
    {
        $rfqSupplier = RfqSupplier::with(['rfq.items', 'quoteItems'])->where('portal_token_hash', PortalToken::hash($token))->first();
        abort_if($rfqSupplier === null, 404, 'This link is not valid. It may have been replaced by a newer one, or the request was cancelled.');
        abort_if($rfqSupplier->portal_token_expires_at?->isPast() && $rfqSupplier->status === 'Sent', 410, 'The reply period for this Request for Quotation has ended.');

        return $rfqSupplier;
    }

    private function poFor(string $token): PurchaseOrder
    {
        $po = PurchaseOrder::with(['items', 'budgetOfficer', 'accountingOfficer', 'approvedBy', 'purchaseRequest'])
            ->where('portal_token_hash', PortalToken::hash($token))->first();
        abort_if($po === null, 404, 'This link is not valid. It may have been replaced by a newer one.');

        return $po;
    }

    private function formatRfq(RfqSupplier $rfqSupplier): array
    {
        $rfq = $rfqSupplier->rfq;
        $quotes = $rfqSupplier->quoteItems->keyBy('rfq_item_id');

        return [
            'agency_name' => $this->preferenceValue('agency_name', 'Department of Science and Technology - Caraga'),
            'rfq_no' => $rfq->rfq_no,
            'purpose' => $rfq->purpose,
            'procurement_category' => $rfq->procurement_category,
            'rfq_date' => $rfq->rfq_date,
            'place_of_delivery' => $rfq->place_of_delivery,
            'estimated_budget' => $rfq->estimated_budget,
            'supplier_name' => $rfqSupplier->supplier_name,
            'status' => $rfqSupplier->status,
            'can_submit' => $rfqSupplier->status === 'Sent' && $rfq->status === 'Canvassing',
            'reply_due_at' => $rfqSupplier->reply_due_at?->toISOString(),
            'replied_at' => $rfqSupplier->replied_at?->toISOString(),
            'quotation_name' => $rfqSupplier->quotation_original_name,
            'items' => $rfq->items->map(fn ($item) => [
                'id' => $item->id,
                'item_no' => $item->item_no,
                'description' => $item->description,
                'uom' => $item->uom,
                'quantity' => $item->quantity,
                'unit_abc' => $item->unit_abc,
                'total_abc' => $item->total_abc,
                'unit_price' => $quotes[$item->id]->unit_price ?? null,
                'total_price' => $quotes[$item->id]->total_price ?? null,
            ]),
        ];
    }

    private function formatPo(PurchaseOrder $po): array
    {
        $signer = fn (?string $name, $at, $user) => $at ? ['name' => $name, 'signed_at' => $at->toISOString(), 'signature' => $user?->signature] : null;

        return [
            'agency_name' => $this->preferenceValue('agency_name', 'Department of Science and Technology - Caraga'),
            'po_no' => $po->po_no,
            'po_date' => $po->po_date,
            'pr_no' => $po->purchaseRequest?->pr_no,
            'supplier_name' => $po->supplier_name,
            'supplier_address' => $po->supplier_address,
            'supplier_tin' => $po->supplier_tin,
            'place_of_delivery' => $po->place_of_delivery,
            'delivery_date' => $po->delivery_date,
            'mode_of_procurement' => $po->mode_of_procurement,
            'terms_and_conditions' => $po->terms_and_conditions,
            'total_amount' => $po->total_amount,
            'items' => $po->items->map(fn ($item) => $item->only(['item_no', 'description', 'uom', 'quantity', 'unit_cost', 'total_cost'])),
            'signatures' => [
                'budget_officer' => $signer($po->budget_officer_name, $po->budget_officer_signed_at, $po->budgetOfficer),
                'accounting_officer' => $signer($po->accounting_officer_name, $po->accounting_officer_signed_at, $po->accountingOfficer),
                'approved_by' => $signer($po->approved_by_name, $po->approved_by_signed_at, $po->approvedBy),
            ],
            'status' => $po->status,
            'can_respond' => $po->status === 'Forwarded to Supplier',
            'delivery_waived' => $po->delivery_waived,
            'delivery_waived_reason' => $po->delivery_waived_reason,
            'delivery_accepted_at' => $po->delivery_accepted_at?->toISOString(),
        ];
    }
}
