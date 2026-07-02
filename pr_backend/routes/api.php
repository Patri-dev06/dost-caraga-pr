<?php

use App\Http\Controllers\Api\ApprovalInboxController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\LibController;
use App\Http\Controllers\Api\PpmpController;
use App\Http\Controllers\Api\ProcurementController;
use App\Http\Controllers\Api\WorkflowConfigController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::post('/auth/login', [AuthController::class, 'login']);

    Route::middleware('auth.token')->group(function (): void {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::post('/auth/refresh', [AuthController::class, 'refresh']);
        Route::get('/auth/me', [AuthController::class, 'me']);

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
        Route::get('/purchase-requests/{resourceId}', [ProcurementController::class, 'show'])->defaults('resource', 'purchase-requests');
        Route::put('/purchase-requests/{resourceId}', [ProcurementController::class, 'update'])->defaults('resource', 'purchase-requests');
        Route::post('/purchase-requests/{purchaseRequest}/validate', [ProcurementController::class, 'validatePurchaseRequest']);
        Route::post('/purchase-requests/{purchaseRequest}/submit', [ProcurementController::class, 'submitPurchaseRequest']);

        Route::get('/approvals', [ProcurementController::class, 'approvals']);
        Route::post('/approvals/{purchaseRequest}/recommend', [ProcurementController::class, 'recommend']);
        Route::post('/approvals/{purchaseRequest}/approve', [ProcurementController::class, 'approve']);
        Route::post('/approvals/{purchaseRequest}/reject', [ProcurementController::class, 'reject']);
        Route::post('/purchase-requests/{purchaseRequest}/cancel', [ProcurementController::class, 'cancelPurchaseRequest']);
        Route::get('/audit-logs', [ProcurementController::class, 'auditLogs']);
        Route::get('/system-settings', [ProcurementController::class, 'systemSettings']);
        Route::put('/system-settings', [ProcurementController::class, 'updateSystemSettings']);

        // LIB (Line Item Budget) Routes
        Route::get('/lib', [LibController::class, 'index']);
        Route::post('/lib', [LibController::class, 'store']);
        Route::get('/lib/{lib}', [LibController::class, 'show']);
        Route::put('/lib/{lib}', [LibController::class, 'update']);
        Route::get('/lib/{lib}/balance', [LibController::class, 'balance']);
        Route::post('/lib/{lib}/submit', [LibController::class, 'submit']);
        Route::post('/lib/{lib}/approve', [LibController::class, 'approve']);
        Route::post('/lib/{lib}/return', [LibController::class, 'returnDocument']);
        Route::post('/lib/{lib}/reject', [LibController::class, 'reject']);
        Route::post('/lib/{lib}/amend', [LibController::class, 'amend']);
        Route::post('/lib/{lib}/cancel', [LibController::class, 'cancel']);
        Route::get('/lib/{lib}/export', [LibController::class, 'export']);

        // PPMP Document Routes (enhanced with approval workflow)
        Route::get('/ppmp-documents', [PpmpController::class, 'index']);
        Route::post('/ppmp-documents', [PpmpController::class, 'store']);
        Route::get('/ppmp-documents/{ppmpDocument}', [PpmpController::class, 'show']);
        Route::put('/ppmp-documents/{ppmpDocument}', [PpmpController::class, 'update']);
        Route::post('/ppmp-documents/{ppmpDocument}/items', [PpmpController::class, 'storeItem']);
        Route::put('/ppmp-documents/{ppmpDocument}/items/{ppmpItem}', [PpmpController::class, 'updateItem']);
        Route::delete('/ppmp-documents/{ppmpDocument}/items/{ppmpItem}', [PpmpController::class, 'destroyItem']);
        Route::post('/ppmp-documents/{ppmpDocument}/submit', [PpmpController::class, 'submit']);
        Route::post('/ppmp-documents/{ppmpDocument}/approve', [PpmpController::class, 'approve']);
        Route::post('/ppmp-documents/{ppmpDocument}/return', [PpmpController::class, 'returnDocument']);
        Route::post('/ppmp-documents/{ppmpDocument}/reject', [PpmpController::class, 'reject']);
        Route::post('/ppmp-documents/{ppmpDocument}/amend', [PpmpController::class, 'amend']);
        Route::post('/ppmp-documents/{ppmpDocument}/cancel', [PpmpController::class, 'cancel']);
        Route::get('/ppmp-items/available', [PpmpController::class, 'availableItems']);

        // Approval Inbox (polymorphic)
        Route::get('/approval-inbox', [ApprovalInboxController::class, 'index']);
        Route::get('/approval-inbox/count', [ApprovalInboxController::class, 'count']);
        Route::post('/approval-inbox/{type}/{id}/approve', [ApprovalInboxController::class, 'approve']);
        Route::post('/approval-inbox/{type}/{id}/return', [ApprovalInboxController::class, 'returnDocument']);
        Route::post('/approval-inbox/{type}/{id}/reject', [ApprovalInboxController::class, 'reject']);

        // Workflow Configuration
        Route::get('/workflow-config', [WorkflowConfigController::class, 'index']);
        Route::put('/workflow-config', [WorkflowConfigController::class, 'update']);
    });
});
