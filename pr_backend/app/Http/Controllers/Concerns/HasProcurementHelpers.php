<?php

namespace App\Http\Controllers\Concerns;

use App\Models\ApprovalAction;
use App\Models\AuditLog;
use App\Models\SystemPreference;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

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

    /** Block a signing/approval action when the acting user has no e-signature on file. */
    private function requireSignature(?User $user): void
    {
        abort_if(
            $user === null || empty($user->signature),
            422,
            'Upload your e-signature first (top-right account menu → My E-Signature) before you can sign or approve documents.',
        );
    }

    /**
     * Name and position of whoever prepared a document, for its "Prepared by" line. A user with no
     * position on their profile falls back to their first role, like the signatory pickers do.
     *
     * @return array{name: string, position: string}|null
     */
    private function preparedBy(?User $user): ?array
    {
        if ($user === null) {
            return null;
        }

        $user->loadMissing('roles');

        return ['name' => $user->name, 'position' => $user->position ?: (string) $user->roles->pluck('name')->first()];
    }

    /** Persist an in-app notification and, if enabled, best-effort send an email. */
    private function notify(?User $recipient, string $type, string $title, ?string $body, ?string $link, array $data = []): void
    {
        if ($recipient === null) {
            return;
        }

        UserNotification::create([
            'user_id' => $recipient->id,
            'type' => $type,
            'title' => $title,
            'body' => $body,
            'link' => $link,
            'data' => $data,
        ]);

        if (! $this->preferenceValue('email_notifications_enabled', true) || empty($recipient->email)) {
            return;
        }

        // Email delivery is best-effort: a missing/unconfigured mailer must never
        // break the request. Wire up SMTP later and this starts sending for real.
        try {
            Mail::raw(trim($title."\n\n".($body ?? '')), function ($message) use ($recipient, $title): void {
                $message->to($recipient->email)->subject($title);
            });
        } catch (\Throwable $e) {
            Log::warning('Notification email failed', ['recipient' => $recipient->email, 'error' => $e->getMessage()]);
        }
    }

    private function ensureDefaultSystemPreferences(): void
    {
        foreach ($this->defaultSystemPreferences() as $preference) {
            SystemPreference::firstOrCreate(
                ['key' => $preference['key']],
                $preference
            );
        }
    }

    private function normalizePreferenceValue(mixed $value): array
    {
        return ['value' => $value];
    }

    private function preferenceValue(string $key, mixed $fallback): mixed
    {
        $this->ensureDefaultSystemPreferences();

        return SystemPreference::where('key', $key)->first()?->value['value'] ?? $fallback;
    }

    private function defaultSystemPreferences(): array
    {
        return [
            [
                'key' => 'agency_name',
                'value' => ['value' => 'Department of Science and Technology - Caraga'],
                'category' => 'Agency',
                'label' => 'Agency Name',
                'description' => 'Official agency name shown in system headers and reports.',
                'type' => 'text',
            ],
            [
                'key' => 'office_region',
                'value' => ['value' => 'Caraga Region'],
                'category' => 'Agency',
                'label' => 'Office Region',
                'description' => 'Regional office label used in generated procurement records.',
                'type' => 'text',
            ],
            [
                'key' => 'fiscal_year',
                'value' => ['value' => now()->year],
                'category' => 'Procurement',
                'label' => 'Fiscal Year',
                'description' => 'Default procurement fiscal year for planning and monitoring views.',
                'type' => 'number',
            ],
            [
                'key' => 'pr_number_prefix',
                'value' => ['value' => 'PR'],
                'category' => 'Procurement',
                'label' => 'PR Number Prefix',
                'description' => 'Prefix used when generating purchase request numbers.',
                'type' => 'text',
            ],
            [
                'key' => 'recommending_approval_stage',
                'value' => ['value' => 'Supervisor/Recommending Approval for Digital Sign'],
                'category' => 'Workflow',
                'label' => 'Recommending Approval Stage',
                'description' => 'Label for the stage after a PR is submitted by the requester.',
                'type' => 'text',
            ],
            [
                'key' => 'rd_approval_stage',
                'value' => ['value' => 'Forwarded to RD for Digital Sign'],
                'category' => 'Workflow',
                'label' => 'RD Approval Stage',
                'description' => 'Label for the final approval stage before a PR is approved.',
                'type' => 'text',
            ],
            [
                'key' => 'require_digital_signature',
                'value' => ['value' => true],
                'category' => 'Workflow',
                'label' => 'Require Digital Signature',
                'description' => 'Marks the approval flow as requiring digital signature routing.',
                'type' => 'boolean',
            ],
            [
                'key' => 'budget_officer_user_id',
                'value' => ['value' => optional(User::where('email', 'admin@dost.gov.ph')->first())->id],
                'category' => 'Workflow',
                'label' => 'Budget Officer',
                'description' => 'Account that certifies fund availability on PPMPs and LIBs. Submissions are routed here for review, return, or approval.',
                'type' => 'text',
            ],
            [
                'key' => 'supervisor_user_id',
                'value' => ['value' => null],
                'category' => 'Workflow',
                'label' => 'Supervisor (Recommending Approval)',
                'description' => 'Account that recommends approval on LIBs. Submitted LIBs are routed here first.',
                'type' => 'text',
            ],
            [
                'key' => 'regional_director_user_id',
                'value' => ['value' => optional(User::where('email', 'admin@dost.gov.ph')->first())->id],
                'category' => 'Workflow',
                'label' => 'Regional Director (Approving Authority)',
                'description' => 'Account that gives final approval on LIBs and Purchase Requests. Only this account (or a superadmin) may approve/reject a PR.',
                'type' => 'text',
            ],
            [
                'key' => 'email_notifications_enabled',
                'value' => ['value' => true],
                'category' => 'Notifications',
                'label' => 'Email Notifications',
                'description' => 'Enable email notifications for submissions, returns, and approvals.',
                'type' => 'boolean',
            ],
            [
                'key' => 'bac_chair_user_id',
                'value' => ['value' => optional(User::where('email', 'admin@dost.gov.ph')->first())->id],
                'category' => 'Workflow',
                'label' => 'BAC Chairman',
                'description' => 'Account that signs an RFQ first, before it can be sent to suppliers.',
                'type' => 'text',
            ],
            [
                'key' => 'bac_vice_chair_user_id',
                'value' => ['value' => optional(User::where('email', 'admin@dost.gov.ph')->first())->id],
                'category' => 'Workflow',
                'label' => 'BAC Vice-Chairman',
                'description' => 'Account that signs an RFQ after the BAC Chairman.',
                'type' => 'text',
            ],
            [
                'key' => 'supply_officer_user_id',
                'value' => ['value' => optional(User::where('email', 'admin@dost.gov.ph')->first())->id],
                'category' => 'Workflow',
                'label' => 'Supply Officer',
                'description' => 'Account that countersigns an RFQ, the final step before it can be sent to suppliers.',
                'type' => 'text',
            ],
            [
                'key' => 'accounting_officer_user_id',
                'value' => ['value' => optional(User::where('email', 'admin@dost.gov.ph')->first())->id],
                'category' => 'Workflow',
                'label' => 'Accounting Officer',
                'description' => 'Account that signs a Purchase Order after Budget obligation, before Regional Director final approval.',
                'type' => 'text',
            ],
            [
                'key' => 'twg_lead_user_id',
                'value' => ['value' => optional(User::where('email', 'admin@dost.gov.ph')->first())->id],
                'category' => 'Workflow',
                'label' => 'TWG Lead',
                'description' => 'Account that addresses BAC remarks on an Abstract of Canvas on behalf of the Technical Working Group.',
                'type' => 'text',
            ],
        ];
    }

    /** The user currently designated as Budget Officer, or null if none is set. */
    private function designatedBudgetOfficer(): ?User
    {
        $id = $this->preferenceValue('budget_officer_user_id', null);

        return $id ? User::find((int) $id) : null;
    }

    /** The user currently designated as Supervisor (recommends approval on LIBs). */
    private function designatedSupervisor(): ?User
    {
        $id = $this->preferenceValue('supervisor_user_id', null);

        return $id ? User::find((int) $id) : null;
    }

    /** The user currently designated as Regional Director (final LIB approver). */
    private function designatedRegionalDirector(): ?User
    {
        $id = $this->preferenceValue('regional_director_user_id', null);

        return $id ? User::find((int) $id) : null;
    }

    private function designatedBacChair(): ?User
    {
        $id = $this->preferenceValue('bac_chair_user_id', null);

        return $id ? User::find((int) $id) : null;
    }

    private function designatedBacViceChair(): ?User
    {
        $id = $this->preferenceValue('bac_vice_chair_user_id', null);

        return $id ? User::find((int) $id) : null;
    }

    private function designatedSupplyOfficer(): ?User
    {
        $id = $this->preferenceValue('supply_officer_user_id', null);

        return $id ? User::find((int) $id) : null;
    }

    private function designatedAccountingOfficer(): ?User
    {
        $id = $this->preferenceValue('accounting_officer_user_id', null);

        return $id ? User::find((int) $id) : null;
    }

    private function designatedTwgLead(): ?User
    {
        $id = $this->preferenceValue('twg_lead_user_id', null);

        return $id ? User::find((int) $id) : null;
    }
}
