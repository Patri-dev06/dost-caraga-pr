<?php

namespace App\Services;

use App\Models\ApprovalStep;
use App\Models\ApprovalWorkflow;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\ValidationException;

class ApprovalEngineService
{
    public function submit(Model $approvable, User $actor): ApprovalStep
    {
        $this->assertNotLocked($approvable);

        if (! in_array($approvable->status, ['Draft', 'Returned'], true)) {
            throw ValidationException::withMessages([
                'status' => ['Document must be in Draft or Returned status to submit.'],
            ]);
        }

        $firstStage = $this->getFirstStage($this->documentType($approvable));

        if (! $firstStage) {
            throw ValidationException::withMessages([
                'workflow' => ['No approval workflow configured for this document type.'],
            ]);
        }

        $approvable->forceFill([
            'status' => 'Submitted',
        ])->save();

        return $this->recordStep($approvable, $firstStage, $actor, 'submitted');
    }

    public function approve(Model $approvable, User $actor, ?string $remarks = null): ApprovalStep
    {
        $this->assertNotLocked($approvable);
        $currentStage = $this->getCurrentStage($approvable);

        if (! $currentStage) {
            throw ValidationException::withMessages([
                'workflow' => ['No pending approval stage found for this document.'],
            ]);
        }

        $this->assertUserCanAct($currentStage, $actor);

        $step = $this->recordStep($approvable, $currentStage, $actor, 'approved', $remarks);

        if ($currentStage->is_final) {
            $approvable->forceFill([
                'status' => 'Approved',
                'approved_at' => now(),
            ])->save();
        } else {
            $nextStage = $this->getNextStage($this->documentType($approvable), $currentStage->stage_order);
            if ($nextStage) {
                $approvable->forceFill(['status' => 'Submitted'])->save();
            }
        }

        return $step;
    }

    public function returnDocument(Model $approvable, User $actor, string $remarks): ApprovalStep
    {
        $this->assertNotLocked($approvable);
        $currentStage = $this->getCurrentStage($approvable);

        if (! $currentStage) {
            throw ValidationException::withMessages([
                'workflow' => ['No pending approval stage found for this document.'],
            ]);
        }

        $this->assertUserCanAct($currentStage, $actor);

        $approvable->forceFill(['status' => 'Returned'])->save();

        return $this->recordStep($approvable, $currentStage, $actor, 'returned', $remarks);
    }

    public function reject(Model $approvable, User $actor, string $remarks): ApprovalStep
    {
        $this->assertNotLocked($approvable);
        $currentStage = $this->getCurrentStage($approvable);

        if (! $currentStage) {
            throw ValidationException::withMessages([
                'workflow' => ['No pending approval stage found for this document.'],
            ]);
        }

        $this->assertUserCanAct($currentStage, $actor);

        $approvable->forceFill(['status' => 'Rejected'])->save();

        return $this->recordStep($approvable, $currentStage, $actor, 'rejected', $remarks);
    }

    public function getCurrentStage(Model $approvable): ?ApprovalWorkflow
    {
        $docType = $this->documentType($approvable);

        $lastApprovedStep = $approvable->approvalSteps()
            ->where('action', 'approved')
            ->orderByDesc('acted_at')
            ->first();

        if ($lastApprovedStep) {
            $lastStage = $lastApprovedStep->workflowStage;
            return $this->getNextStage($docType, $lastStage->stage_order);
        }

        return $this->getFirstStage($docType);
    }

    public function canUserAct(Model $approvable, User $user): bool
    {
        $currentStage = $this->getCurrentStage($approvable);

        if (! $currentStage) {
            return false;
        }

        return $user->roles->contains('name', $currentStage->required_role);
    }

    public function isLocked(Model $approvable): bool
    {
        return in_array($approvable->status, ['Approved', 'Cancelled', 'Rejected'], true);
    }

    public function getApprovalTrail(Model $approvable): array
    {
        return $approvable->approvalSteps()
            ->with('workflowStage')
            ->orderBy('acted_at')
            ->get()
            ->map(fn (ApprovalStep $step) => [
                'id' => $step->id,
                'stage_name' => $step->workflowStage?->stage_name,
                'approver_name' => $step->approver_name,
                'approver_designation' => $step->approver_designation,
                'action' => $step->action,
                'remarks' => $step->remarks,
                'acted_at' => $step->acted_at?->toISOString(),
            ])
            ->all();
    }

    private function documentType(Model $approvable): string
    {
        return match (get_class($approvable)) {
            \App\Models\LibEntry::class => 'lib',
            \App\Models\PpmpDocument::class => 'ppmp',
            \App\Models\PurchaseRequest::class => 'purchase_request',
            default => throw new \InvalidArgumentException('Unsupported approvable type: ' . get_class($approvable)),
        };
    }

    private function getFirstStage(string $documentType): ?ApprovalWorkflow
    {
        return ApprovalWorkflow::where('document_type', $documentType)
            ->orderBy('stage_order')
            ->first();
    }

    private function getNextStage(string $documentType, int $currentOrder): ?ApprovalWorkflow
    {
        return ApprovalWorkflow::where('document_type', $documentType)
            ->where('stage_order', '>', $currentOrder)
            ->orderBy('stage_order')
            ->first();
    }

    private function assertNotLocked(Model $approvable): void
    {
        if ($this->isLocked($approvable)) {
            throw ValidationException::withMessages([
                'status' => ['This document is locked and cannot be modified. Status: ' . $approvable->status],
            ]);
        }
    }

    private function assertUserCanAct(ApprovalWorkflow $stage, User $user): void
    {
        $user->loadMissing('roles');

        if (! $user->roles->contains('name', $stage->required_role)) {
            throw ValidationException::withMessages([
                'authorization' => ["You do not have the required role ({$stage->required_role}) to act on this stage ({$stage->stage_name})."],
            ]);
        }
    }

    private function recordStep(Model $approvable, ApprovalWorkflow $stage, User $actor, string $action, ?string $remarks = null): ApprovalStep
    {
        return $approvable->approvalSteps()->create([
            'workflow_stage_id' => $stage->id,
            'user_id' => $actor->id,
            'approver_name' => $actor->name,
            'approver_designation' => $actor->roles->pluck('name')->implode(', '),
            'action' => $action,
            'remarks' => $remarks,
            'acted_at' => now(),
        ]);
    }
}
