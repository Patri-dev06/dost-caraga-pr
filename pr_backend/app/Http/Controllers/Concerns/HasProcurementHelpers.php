<?php

namespace App\Http\Controllers\Concerns;

use App\Models\ApprovalAction;
use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * Shared by ProcurementController, RfqController, and PurchaseOrderController so
 * PR/RFQ/PO approval trails and audit logging behave identically.
 */
trait HasProcurementHelpers
{
    /** Abort with 403 unless the current user may access the given module. */
    private function guardModule(string $module): void
    {
        abort_unless(request()->user()?->canAccessModule($module), 403, 'You do not have access to this module.');
    }

    private function audit(Request $request, string $module, string $action, mixed $target = null): void
    {
        $user = $request->user();

        AuditLog::create([
            'actor_id' => $user?->id,
            'actor_name' => $user?->name,
            'role' => $user?->roles->pluck('name')->implode(', '),
            'module' => $module,
            'action' => $action,
            'target' => $target === null ? null : (string) $target,
            'ip_address' => $request->ip(),
            'created_at' => now(),
        ]);
    }

    /** Records one step of a PR/RFQ/PO approval trail and audits it. */
    private function recordAction(Request $request, Model $actionable, string $role, string $action, ?string $remarks): void
    {
        ApprovalAction::create([
            'actionable_id' => $actionable->getKey(),
            'actionable_type' => $actionable::class,
            'user_id' => $request->user()->id,
            'role' => $role,
            'action' => $action,
            'remarks' => $remarks,
        ]);

        $documentNo = $actionable->pr_no ?? $actionable->rfq_no ?? $actionable->po_no ?? (string) $actionable->getKey();
        $this->audit($request, $role === 'Requester' ? 'Purchase Requests' : 'Approval Inbox', $action, $documentNo);
    }
}
