<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ProcurementController;
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
        Route::get('/audit-logs', [ProcurementController::class, 'auditLogs']);
        Route::get('/system-settings', [ProcurementController::class, 'systemSettings']);
        Route::put('/system-settings', [ProcurementController::class, 'updateSystemSettings']);
    });
});
