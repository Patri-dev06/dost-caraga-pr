<?php

use App\Http\Controllers\Api\AbstractOfCanvasController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PortalController;
use App\Http\Controllers\Api\ProcurementController;
use App\Http\Controllers\Api\PurchaseOrderController;
use App\Http\Controllers\Api\RfqController;
use App\Http\Controllers\Api\SupplierController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:register');
    Route::get('/auth/offices', [AuthController::class, 'offices']);

    // Supplier Portal: public, one link token = one supplier's RFQ or one Purchase Order.
    Route::middleware('throttle:portal')->prefix('portal')->group(function (): void {
        Route::get('/rfq/{token}', [PortalController::class, 'showRfq']);
        Route::post('/rfq/{token}/quote', [PortalController::class, 'submitQuote']);
        Route::get('/po/{token}', [PortalController::class, 'showPo']);
        Route::post('/po/{token}/respond', [PortalController::class, 'respondPo']);
    });

    Route::middleware('auth.token')->group(function (): void {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::post('/auth/refresh', [AuthController::class, 'refresh']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::put('/auth/me', [AuthController::class, 'updateMe']);

        // Approved accounts for signatory pickers (readable by any signed-in user).
        Route::get('/signatories', [ProcurementController::class, 'signatories']);
        Route::get('/budget-officer', [ProcurementController::class, 'budgetOfficer']);
        Route::get('/workflow-signatories', [ProcurementController::class, 'workflowSignatories']);

        // Current user's e-signature (required before signing/approving).
        Route::get('/me/signature', [ProcurementController::class, 'showSignature']);
        Route::post('/me/signature', [ProcurementController::class, 'storeSignature']);
        Route::delete('/me/signature', [ProcurementController::class, 'destroySignature']);

        // In-app notifications.
        Route::get('/notifications', [ProcurementController::class, 'notifications']);
        Route::post('/notifications/read-all', [ProcurementController::class, 'markAllNotificationsRead']);
        Route::post('/notifications/{notification}/read', [ProcurementController::class, 'markNotificationRead']);

        Route::get('/planning-libs', [ProcurementController::class, 'planningLibIndex']);
        Route::post('/planning-libs', [ProcurementController::class, 'planningLibStore']);
        Route::get('/planning-libs/{clientUid}', [ProcurementController::class, 'planningLibShow']);
        Route::put('/planning-libs/{clientUid}', [ProcurementController::class, 'planningLibStore']);
        Route::post('/planning-libs/{clientUid}/submit', [ProcurementController::class, 'planningLibSubmit']);
        Route::post('/planning-libs/{clientUid}/recommend', [ProcurementController::class, 'planningLibRecommend']);
        Route::post('/planning-libs/{clientUid}/certify', [ProcurementController::class, 'planningLibCertify']);
        Route::post('/planning-libs/{clientUid}/approve', [ProcurementController::class, 'planningLibApprove']);
        Route::post('/planning-libs/{clientUid}/return', [ProcurementController::class, 'planningLibReturn']);
        Route::delete('/planning-libs/{clientUid}', [ProcurementController::class, 'planningLibDestroy']);

        Route::get('/planning-ppmps', [ProcurementController::class, 'planningPpmpIndex']);
        Route::post('/planning-ppmps', [ProcurementController::class, 'planningPpmpStore']);
        Route::get('/planning-ppmps/{clientUid}', [ProcurementController::class, 'planningPpmpShow']);
        Route::put('/planning-ppmps/{clientUid}', [ProcurementController::class, 'planningPpmpStore']);
        Route::post('/planning-ppmps/{clientUid}/return', [ProcurementController::class, 'planningPpmpReturn']);
        Route::post('/planning-ppmps/{clientUid}/approve', [ProcurementController::class, 'planningPpmpApprove']);
        Route::delete('/planning-ppmps/{clientUid}', [ProcurementController::class, 'planningPpmpDestroy']);

        foreach (['users', 'roles', 'offices', 'fund-sources', 'projects', 'procurement-items'] as $resource) {
            Route::get($resource, [ProcurementController::class, 'index'])->defaults('resource', $resource);
            Route::post($resource, [ProcurementController::class, 'store'])->defaults('resource', $resource);
            Route::get($resource.'/{resourceId}', [ProcurementController::class, 'show'])->defaults('resource', $resource);
            Route::put($resource.'/{resourceId}', [ProcurementController::class, 'update'])->defaults('resource', $resource);
            Route::delete($resource.'/{resourceId}', [ProcurementController::class, 'destroy'])->defaults('resource', $resource);
        }

        Route::get('/ppmp/{project}', [ProcurementController::class, 'ppmpIndex']);
        Route::post('/ppmp/{project}', [ProcurementController::class, 'ppmpStore']);
        Route::post('/ppmp/{project}/documents', [ProcurementController::class, 'ppmpDocumentStore']);
        Route::get('/app-cse/{project?}', [ProcurementController::class, 'appCseIndex']);
        Route::post('/app-cse/{project?}', [ProcurementController::class, 'appCseStore']);
        Route::get('/app-non-cse/{project?}', [ProcurementController::class, 'appNonCseIndex']);
        Route::post('/app-non-cse/{project?}', [ProcurementController::class, 'appNonCseStore']);
        Route::get('/budget/{project}', [ProcurementController::class, 'budgetShow']);
        Route::post('/budget/{project}', [ProcurementController::class, 'budgetStore']);
        Route::post('/checks/ppmp', [ProcurementController::class, 'checkPpmp']);
        Route::post('/checks/lib', [ProcurementController::class, 'checkLineItemBudget']);
        Route::post('/checks/ppmp-lib', [ProcurementController::class, 'checkPpmpAndLib']);

        Route::post('/purchase-request', [ProcurementController::class, 'store'])->defaults('resource', 'purchase-requests');
        Route::get('/purchase-requests', [ProcurementController::class, 'index'])->defaults('resource', 'purchase-requests');
        Route::post('/purchase-requests', [ProcurementController::class, 'store'])->defaults('resource', 'purchase-requests');
        Route::get('/purchase-requests/usage', [ProcurementController::class, 'purchaseRequestUsage']);
        Route::get('/purchase-requests/monitoring', [ProcurementController::class, 'purchaseRequestMonitoring']);
        Route::get('/purchase-requests/{resourceId}', [ProcurementController::class, 'show'])->defaults('resource', 'purchase-requests');
        Route::put('/purchase-requests/{resourceId}', [ProcurementController::class, 'update'])->defaults('resource', 'purchase-requests');
        Route::post('/purchase-requests/{purchaseRequest}/validate', [ProcurementController::class, 'validatePurchaseRequest']);
        Route::post('/purchase-requests/{purchaseRequest}/submit', [ProcurementController::class, 'submitPurchaseRequest']);
        Route::post('/purchase-requests/{purchaseRequest}/re-pr', [ProcurementController::class, 'rePurchaseRequest']);

        Route::get('/approvals', [ProcurementController::class, 'approvals']);
        Route::post('/approvals/{purchaseRequest}/recommend', [ProcurementController::class, 'recommend']);
        Route::post('/approvals/{purchaseRequest}/approve', [ProcurementController::class, 'approve']);
        Route::post('/approvals/{purchaseRequest}/reject', [ProcurementController::class, 'reject']);

        Route::get('/rfqs', [RfqController::class, 'index']);
        Route::post('/rfqs', [RfqController::class, 'store']);
        Route::get('/rfqs/{rfq}', [RfqController::class, 'show']);
        Route::put('/rfqs/{rfq}', [RfqController::class, 'update']);

        // Flowchart signing order: Supply Officer counter-sign, then the BAC Chair OR Vice-Chair.
        Route::post('/rfqs/{rfq}/sign/supply-officer', [RfqController::class, 'signAsSupplyOfficer']);
        Route::post('/rfqs/{rfq}/sign/bac', [RfqController::class, 'signAsBac']);

        // Supplier directory ("Filter Supplier based on category").
        Route::get('/suppliers', [SupplierController::class, 'index']);
        Route::post('/suppliers', [SupplierController::class, 'store']);
        Route::get('/suppliers/{supplier}', [SupplierController::class, 'show']);
        Route::put('/suppliers/{supplier}', [SupplierController::class, 'update']);
        Route::delete('/suppliers/{supplier}', [SupplierController::class, 'destroy']);

        // Canvass: choose 3, send through the Supplier Portal, cancel non-responders, choose n replacements.
        Route::post('/rfqs/{rfq}/suppliers', [RfqController::class, 'addSupplier']);
        Route::post('/rfqs/{rfq}/suppliers/choose', [RfqController::class, 'chooseReplacements']);
        Route::delete('/rfqs/{rfq}/suppliers/{rfqSupplier}', [RfqController::class, 'removeSupplier']);
        Route::post('/rfqs/{rfq}/send', [RfqController::class, 'send']);
        Route::post('/rfqs/{rfq}/suppliers/{rfqSupplier}/portal-link', [RfqController::class, 'resendPortalLink']);
        Route::post('/rfqs/{rfq}/suppliers/{rfqSupplier}/quote', [RfqController::class, 'recordQuote']);
        Route::get('/rfqs/{rfq}/suppliers/{rfqSupplier}/quotation', [RfqController::class, 'quotation']);
        Route::post('/rfqs/{rfq}/suppliers/{rfqSupplier}/cancel', [RfqController::class, 'cancelSupplier']);

        // Equipment: TWG specification evaluation, then check each equipment item with each supplier.
        Route::put('/rfqs/{rfq}/twg/notes', [RfqController::class, 'saveTwgNotes']);
        Route::post('/rfqs/{rfq}/suppliers/{rfqSupplier}/twg-check', [RfqController::class, 'twgCheck']);

        // Abstract of Canvas, venue rating, and the BAC review loop.
        Route::post('/rfqs/{rfq}/aoc', [AbstractOfCanvasController::class, 'generate']);
        Route::get('/aoc', [AbstractOfCanvasController::class, 'index']);
        Route::get('/aoc/my-venue-ratings', [AbstractOfCanvasController::class, 'myVenueRatings']);
        Route::get('/aoc/{aoc}', [AbstractOfCanvasController::class, 'show']);
        Route::post('/aoc/{aoc}/venue-ratings', [AbstractOfCanvasController::class, 'rateVenues']);
        Route::post('/aoc/{aoc}/submit-for-bac-review', [AbstractOfCanvasController::class, 'submitForBacReview']);
        Route::post('/aoc/{aoc}/bac-review', [AbstractOfCanvasController::class, 'bacReview']);
        Route::post('/aoc/{aoc}/twg-respond', [AbstractOfCanvasController::class, 'twgRespond']);
        Route::post('/aoc/{aoc}/bac-satisfaction', [AbstractOfCanvasController::class, 'bacSatisfaction']);
        Route::post('/aoc/{aoc}/note-lowest-bidder', [AbstractOfCanvasController::class, 'noteLowestBidder']);

        Route::post('/rfqs/{rfq}/generate-po', [PurchaseOrderController::class, 'generateFromRfq']);

        Route::get('/purchase-orders', [PurchaseOrderController::class, 'index']);
        Route::get('/purchase-orders/{purchaseOrder}', [PurchaseOrderController::class, 'show']);
        Route::put('/purchase-orders/{purchaseOrder}', [PurchaseOrderController::class, 'update']);
        Route::post('/purchase-orders/{purchaseOrder}/submit', [PurchaseOrderController::class, 'submit']);

        // 3-stage approval chain: Budget Obligation -> Accounting -> Regional Director, then forwarded to the supplier.
        Route::post('/approvals/po/{purchaseOrder}/obligate', [PurchaseOrderController::class, 'obligate']);
        Route::post('/approvals/po/{purchaseOrder}/account', [PurchaseOrderController::class, 'account']);
        Route::post('/approvals/po/{purchaseOrder}/final-approve', [PurchaseOrderController::class, 'finalApprove']);
        Route::post('/approvals/po/{purchaseOrder}/reject', [PurchaseOrderController::class, 'reject']);
        Route::post('/purchase-orders/{purchaseOrder}/forward', [PurchaseOrderController::class, 'forward']);
        Route::post('/purchase-orders/{purchaseOrder}/deliver', [PurchaseOrderController::class, 'deliver']);

        Route::get('/audit-logs', [ProcurementController::class, 'auditLogs']);
        Route::get('/system-settings', [ProcurementController::class, 'systemSettings']);
        Route::put('/system-settings', [ProcurementController::class, 'updateSystemSettings']);
    });
});
