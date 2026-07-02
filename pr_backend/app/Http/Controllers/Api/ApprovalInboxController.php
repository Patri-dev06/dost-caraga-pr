<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LibEntry;
use App\Models\PpmpDocument;
use App\Models\PurchaseRequest;
use App\Services\ApprovalEngineService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApprovalInboxController extends Controller
{
    private const TYPE_MAP = [
        'lib' => LibEntry::class,
        'ppmp' => PpmpDocument::class,
        'purchase_request' => PurchaseRequest::class,
    ];

    public function __construct(
        private ApprovalEngineService $approvalEngine,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->loadMissing('roles');
        $type = $request->query('type');

        $items = collect();

        if (! $type || $type === 'lib') {
            $libs = LibEntry::with(['project', 'fundSource', 'creator'])
                ->where('status', 'Submitted')
                ->get()
                ->filter(fn ($lib) => $this->approvalEngine->canUserAct($lib, $user))
                ->map(fn ($lib) => $this->formatInboxItem($lib, 'lib'));
            $items = $items->merge($libs);
        }

        if (! $type || $type === 'ppmp') {
            $ppmps = PpmpDocument::with(['project', 'fundSource'])
                ->where('status', 'Submitted')
                ->get()
                ->filter(fn ($ppmp) => $this->approvalEngine->canUserAct($ppmp, $user))
                ->map(fn ($ppmp) => $this->formatInboxItem($ppmp, 'ppmp'));
            $items = $items->merge($ppmps);
        }

        if (! $type || $type === 'purchase_request') {
            $prs = PurchaseRequest::with(['office', 'fundSource', 'project', 'requester', 'items'])
                ->whereIn('status', ['Submitted', 'For Recommendation', 'For Approval'])
                ->get()
                ->filter(fn ($pr) => $this->approvalEngine->canUserAct($pr, $user))
                ->map(fn ($pr) => $this->formatInboxItem($pr, 'purchase_request'));
            $items = $items->merge($prs);
        }

        return response()->json(['data' => $items->sortByDesc('submitted_at')->values()]);
    }

    public function count(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->loadMissing('roles');

        $count = 0;

        $count += LibEntry::where('status', 'Submitted')
            ->get()
            ->filter(fn ($lib) => $this->approvalEngine->canUserAct($lib, $user))
            ->count();

        $count += PpmpDocument::where('status', 'Submitted')
            ->get()
            ->filter(fn ($ppmp) => $this->approvalEngine->canUserAct($ppmp, $user))
            ->count();

        $count += PurchaseRequest::whereIn('status', ['Submitted', 'For Recommendation', 'For Approval'])
            ->get()
            ->filter(fn ($pr) => $this->approvalEngine->canUserAct($pr, $user))
            ->count();

        return response()->json(['count' => $count]);
    }

    public function approve(Request $request, string $type, int $id): JsonResponse
    {
        $model = $this->resolveModel($type, $id);
        $this->approvalEngine->approve($model, $request->user(), $request->input('remarks'));
        $this->audit($request, "Approved {$type}", $id);

        return response()->json(['message' => 'Document approved.', 'status' => $model->fresh()->status]);
    }

    public function returnDocument(Request $request, string $type, int $id): JsonResponse
    {
        $request->validate(['remarks' => ['required', 'string']]);

        $model = $this->resolveModel($type, $id);
        $this->approvalEngine->returnDocument($model, $request->user(), $request->input('remarks'));
        $this->audit($request, "Returned {$type}", $id);

        return response()->json(['message' => 'Document returned for revision.', 'status' => $model->fresh()->status]);
    }

    public function reject(Request $request, string $type, int $id): JsonResponse
    {
        $request->validate(['remarks' => ['required', 'string']]);

        $model = $this->resolveModel($type, $id);
        $this->approvalEngine->reject($model, $request->user(), $request->input('remarks'));
        $this->audit($request, "Rejected {$type}", $id);

        return response()->json(['message' => 'Document rejected.', 'status' => $model->fresh()->status]);
    }

    private function resolveModel(string $type, int $id): Model
    {
        abort_unless(isset(self::TYPE_MAP[$type]), 404, 'Unknown document type.');

        return self::TYPE_MAP[$type]::findOrFail($id);
    }

    private function formatInboxItem(Model $model, string $type): array
    {
        $currentStage = $this->approvalEngine->getCurrentStage($model);

        return match ($type) {
            'lib' => [
                'id' => $model->id,
                'type' => 'lib',
                'document_no' => $model->account_code,
                'title' => $model->object_of_expenditure,
                'amount' => (float) $model->allocated_amount,
                'current_stage' => $currentStage?->stage_name ?? 'Pending',
                'submitted_at' => $model->updated_at?->toISOString(),
                'submitted_by' => $model->creator?->name ?? 'Unknown',
                'project_title' => $model->project?->title,
                'fund_source' => $model->fundSource?->name,
            ],
            'ppmp' => [
                'id' => $model->id,
                'type' => 'ppmp',
                'document_no' => $model->ppmp_no ?? "PPMP #{$model->id}",
                'title' => $model->end_user_unit ?? 'PPMP Document',
                'amount' => (float) $model->total_estimated_budget,
                'current_stage' => $currentStage?->stage_name ?? 'Pending',
                'submitted_at' => $model->updated_at?->toISOString(),
                'submitted_by' => $model->importer?->name ?? 'Unknown',
                'project_title' => $model->project?->title,
                'fund_source' => $model->fundSource?->name,
            ],
            'purchase_request' => [
                'id' => $model->id,
                'type' => 'purchase_request',
                'document_no' => $model->pr_no,
                'title' => $model->purpose,
                'amount' => $model->items->sum(fn ($i) => (float) $i->quantity * (float) $i->unit_cost),
                'current_stage' => $currentStage?->stage_name ?? $model->stage,
                'submitted_at' => $model->submitted_at?->toISOString(),
                'submitted_by' => $model->requester?->name ?? 'Unknown',
                'project_title' => $model->project?->title,
                'fund_source' => $model->fundSource?->name,
            ],
        };
    }

    private function audit(Request $request, string $action, mixed $target = null): void
    {
        $user = $request->user();

        AuditLog::create([
            'actor_id' => $user?->id,
            'actor_name' => $user?->name,
            'role' => $user?->roles->pluck('name')->implode(', '),
            'module' => 'Approval Inbox',
            'action' => $action,
            'target' => $target === null ? null : (string) $target,
            'ip_address' => $request->ip(),
            'created_at' => now(),
        ]);
    }
}
