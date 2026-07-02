<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\PpmpDocument;
use App\Models\PpmpItem;
use App\Models\ProcurementItem;
use App\Services\ApprovalEngineService;
use App\Services\BudgetEnforcementService;
use App\Services\DocumentAmendmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PpmpController extends Controller
{
    public function __construct(
        private ApprovalEngineService $approvalEngine,
        private BudgetEnforcementService $budgetService,
        private DocumentAmendmentService $amendmentService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = PpmpDocument::with(['project', 'fundSource'])
            ->when($request->query('project_id'), fn ($q, $v) => $q->where('project_id', $v))
            ->when($request->query('fiscal_year'), fn ($q, $v) => $q->where('fiscal_year', $v))
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('fund_source_id'), fn ($q, $v) => $q->where('fund_source_id', $v))
            ->latest('id');

        $data = $query->paginate((int) $request->query('per_page', 15));
        $data->through(fn (PpmpDocument $doc) => $this->formatDocument($doc));

        return response()->json($data);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'project_id' => ['required', 'exists:projects,id'],
            'fund_source_id' => ['nullable', 'exists:fund_sources,id'],
            'ppmp_no' => ['nullable', 'string'],
            'fiscal_year' => ['required', 'integer', 'between:2000,2100'],
            'end_user_unit' => ['nullable', 'string'],
            'document_type' => ['required', 'string', 'in:Indicative,Final'],
        ]);

        $doc = PpmpDocument::create($data + [
            'status' => 'Draft',
            'imported_by' => $request->user()->id,
            'imported_at' => now(),
        ]);

        $this->audit($request, 'Created PPMP Document', $doc->ppmp_no ?: "PPMP #{$doc->id}");

        return response()->json(['data' => $this->formatDocument($doc->fresh(['project', 'fundSource']))], 201);
    }

    public function show(PpmpDocument $ppmpDocument): JsonResponse
    {
        $ppmpDocument->loadMissing(['project', 'fundSource', 'items.item', 'items.libEntry.fundSource', 'approvalSteps.workflowStage']);

        return response()->json([
            'data' => $this->formatDocument($ppmpDocument),
            'items' => $ppmpDocument->items->map(fn (PpmpItem $item) => $this->formatItem($item))->values(),
            'approval_trail' => $this->approvalEngine->getApprovalTrail($ppmpDocument),
        ]);
    }

    public function update(Request $request, PpmpDocument $ppmpDocument): JsonResponse
    {
        if ($ppmpDocument->isLocked()) {
            return response()->json(['message' => 'This PPMP document is locked and cannot be edited.'], 422);
        }

        $data = $request->validate([
            'project_id' => ['sometimes', 'exists:projects,id'],
            'fund_source_id' => ['nullable', 'exists:fund_sources,id'],
            'ppmp_no' => ['nullable', 'string'],
            'fiscal_year' => ['sometimes', 'integer', 'between:2000,2100'],
            'end_user_unit' => ['nullable', 'string'],
            'document_type' => ['sometimes', 'string', 'in:Indicative,Final'],
        ]);

        $ppmpDocument->fill($data)->save();
        $this->audit($request, 'Updated PPMP Document', $ppmpDocument->ppmp_no ?: "PPMP #{$ppmpDocument->id}");

        return response()->json(['data' => $this->formatDocument($ppmpDocument->fresh(['project', 'fundSource']))]);
    }

    public function storeItem(Request $request, PpmpDocument $ppmpDocument): JsonResponse
    {
        if ($ppmpDocument->isLocked()) {
            return response()->json(['message' => 'This PPMP document is locked.'], 422);
        }

        $data = $request->validate([
            'procurement_item_id' => ['nullable', 'exists:procurement_items,id'],
            'item_name' => ['required_without:procurement_item_id', 'nullable', 'string'],
            'lib_entry_id' => ['required', 'exists:lib_entries,id'],
            'fund_source_id' => ['nullable', 'exists:fund_sources,id'],
            'quantity' => ['required', 'numeric', 'min:0.01'],
            'estimated_unit_cost' => ['required', 'numeric', 'min:0'],
            'estimated_budget' => ['nullable', 'numeric', 'min:0'],
            'code' => ['nullable', 'string'],
            'expense_category' => ['nullable', 'string'],
            'general_description' => ['nullable', 'string'],
            'project_type' => ['nullable', 'string'],
            'quantity_size' => ['nullable', 'string'],
            'recommended_mode' => ['nullable', 'string'],
            'schedule' => ['nullable', 'string'],
            'source_of_funds' => ['nullable', 'string'],
            'remarks' => ['nullable', 'string'],
        ]);

        $budget = $data['estimated_budget'] ?? (float) $data['quantity'] * (float) $data['estimated_unit_cost'];

        $this->budgetService->validatePpmpAllocation($data['lib_entry_id'], $budget);

        $procurementItemId = $data['procurement_item_id'] ?? null;
        if (! $procurementItemId && ! empty($data['item_name'])) {
            $procurementItemId = ProcurementItem::firstOrCreate(
                ['name' => $data['item_name']],
                ['uom' => 'unit', 'active' => true]
            )->id;
        }

        $item = PpmpItem::create([
            'ppmp_document_id' => $ppmpDocument->id,
            'lib_entry_id' => $data['lib_entry_id'],
            'fund_source_id' => $data['fund_source_id'] ?? $ppmpDocument->fund_source_id,
            'project_id' => $ppmpDocument->project_id,
            'procurement_item_id' => $procurementItemId,
            'quantity' => $data['quantity'],
            'estimated_unit_cost' => $data['estimated_unit_cost'],
            'estimated_budget' => $budget,
            'code' => $data['code'] ?? null,
            'expense_category' => $data['expense_category'] ?? null,
            'general_description' => $data['general_description'] ?? null,
            'project_type' => $data['project_type'] ?? null,
            'quantity_size' => $data['quantity_size'] ?? null,
            'recommended_mode' => $data['recommended_mode'] ?? null,
            'schedule' => $data['schedule'] ?? null,
            'source_of_funds' => $data['source_of_funds'] ?? null,
            'remarks' => $data['remarks'] ?? null,
        ]);

        $this->recalculateDocumentTotals($ppmpDocument);
        $this->audit($request, 'Added PPMP Item', $item->item?->name ?? "Item #{$item->id}");

        return response()->json(['data' => $this->formatItem($item->fresh(['item', 'libEntry.fundSource']))], 201);
    }

    public function updateItem(Request $request, PpmpDocument $ppmpDocument, PpmpItem $ppmpItem): JsonResponse
    {
        if ($ppmpDocument->isLocked()) {
            return response()->json(['message' => 'This PPMP document is locked.'], 422);
        }

        abort_if($ppmpItem->ppmp_document_id !== $ppmpDocument->id, 404);

        $data = $request->validate([
            'lib_entry_id' => ['sometimes', 'exists:lib_entries,id'],
            'quantity' => ['sometimes', 'numeric', 'min:0.01'],
            'estimated_unit_cost' => ['sometimes', 'numeric', 'min:0'],
            'estimated_budget' => ['nullable', 'numeric', 'min:0'],
            'code' => ['nullable', 'string'],
            'expense_category' => ['nullable', 'string'],
            'general_description' => ['nullable', 'string'],
            'recommended_mode' => ['nullable', 'string'],
            'schedule' => ['nullable', 'string'],
            'remarks' => ['nullable', 'string'],
        ]);

        $quantity = $data['quantity'] ?? (float) $ppmpItem->quantity;
        $unitCost = $data['estimated_unit_cost'] ?? (float) $ppmpItem->estimated_unit_cost;
        $budget = $data['estimated_budget'] ?? $quantity * $unitCost;
        $libEntryId = $data['lib_entry_id'] ?? $ppmpItem->lib_entry_id;

        if ($libEntryId) {
            $this->budgetService->validatePpmpAllocation($libEntryId, $budget, $ppmpItem->id);
        }

        $ppmpItem->fill($data + ['estimated_budget' => $budget])->save();
        $this->recalculateDocumentTotals($ppmpDocument);

        return response()->json(['data' => $this->formatItem($ppmpItem->fresh(['item', 'libEntry.fundSource']))]);
    }

    public function destroyItem(Request $request, PpmpDocument $ppmpDocument, PpmpItem $ppmpItem): JsonResponse
    {
        if ($ppmpDocument->isLocked()) {
            return response()->json(['message' => 'This PPMP document is locked.'], 422);
        }

        abort_if($ppmpItem->ppmp_document_id !== $ppmpDocument->id, 404);

        if ((float) $ppmpItem->encumbered_amount > 0) {
            return response()->json(['message' => 'Cannot remove item with existing PR encumbrances.'], 422);
        }

        $ppmpItem->delete();
        $this->recalculateDocumentTotals($ppmpDocument);
        $this->audit($request, 'Removed PPMP Item', "Item #{$ppmpItem->id}");

        return response()->json(['message' => 'Item removed.']);
    }

    public function submit(Request $request, PpmpDocument $ppmpDocument): JsonResponse
    {
        $this->approvalEngine->submit($ppmpDocument, $request->user());
        $this->audit($request, 'Submitted PPMP for Approval', $ppmpDocument->ppmp_no ?: "PPMP #{$ppmpDocument->id}");

        return response()->json([
            'message' => 'PPMP document submitted for approval.',
            'data' => $this->formatDocument($ppmpDocument->fresh(['project', 'fundSource'])),
        ]);
    }

    public function approve(Request $request, PpmpDocument $ppmpDocument): JsonResponse
    {
        $this->approvalEngine->approve($ppmpDocument, $request->user(), $request->input('remarks'));
        $this->audit($request, 'Approved PPMP Document', $ppmpDocument->ppmp_no ?: "PPMP #{$ppmpDocument->id}");

        return response()->json([
            'message' => 'PPMP document approved.',
            'data' => $this->formatDocument($ppmpDocument->fresh(['project', 'fundSource'])),
        ]);
    }

    public function returnDocument(Request $request, PpmpDocument $ppmpDocument): JsonResponse
    {
        $request->validate(['remarks' => ['required', 'string']]);

        $this->approvalEngine->returnDocument($ppmpDocument, $request->user(), $request->input('remarks'));
        $this->audit($request, 'Returned PPMP Document', $ppmpDocument->ppmp_no ?: "PPMP #{$ppmpDocument->id}");

        return response()->json([
            'message' => 'PPMP document returned for revision.',
            'data' => $this->formatDocument($ppmpDocument->fresh(['project', 'fundSource'])),
        ]);
    }

    public function reject(Request $request, PpmpDocument $ppmpDocument): JsonResponse
    {
        $request->validate(['remarks' => ['required', 'string']]);

        $this->approvalEngine->reject($ppmpDocument, $request->user(), $request->input('remarks'));
        $this->audit($request, 'Rejected PPMP Document', $ppmpDocument->ppmp_no ?: "PPMP #{$ppmpDocument->id}");

        return response()->json([
            'message' => 'PPMP document rejected.',
            'data' => $this->formatDocument($ppmpDocument->fresh(['project', 'fundSource'])),
        ]);
    }

    public function amend(Request $request, PpmpDocument $ppmpDocument): JsonResponse
    {
        $newDoc = $this->amendmentService->amend($ppmpDocument);
        $this->audit($request, 'Amended PPMP Document', ($ppmpDocument->ppmp_no ?: "PPMP #{$ppmpDocument->id}") . ' -> v' . $newDoc->version);

        return response()->json([
            'message' => 'Amendment created as a new draft.',
            'data' => $this->formatDocument($newDoc->fresh(['project', 'fundSource'])),
        ], 201);
    }

    public function cancel(Request $request, PpmpDocument $ppmpDocument): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string']]);

        $this->amendmentService->cancel($ppmpDocument, $request->input('reason'));
        $this->audit($request, 'Cancelled PPMP Document', $ppmpDocument->ppmp_no ?: "PPMP #{$ppmpDocument->id}");

        return response()->json([
            'message' => 'PPMP document cancelled.',
            'data' => $this->formatDocument($ppmpDocument->fresh(['project', 'fundSource'])),
        ]);
    }

    public function availableItems(Request $request): JsonResponse
    {
        $query = PpmpItem::with(['item', 'document', 'libEntry'])
            ->whereHas('document', fn ($q) => $q->where('status', 'Approved'))
            ->when($request->query('fund_source_id'), fn ($q, $v) => $q->where('fund_source_id', $v))
            ->when($request->query('project_id'), fn ($q, $v) => $q->where('project_id', $v));

        $items = $query->get()->map(fn (PpmpItem $item) => [
            'id' => $item->id,
            'item_name' => $item->item?->name,
            'code' => $item->code,
            'quantity' => (float) $item->quantity,
            'estimated_budget' => (float) $item->estimated_budget,
            'encumbered_amount' => (float) $item->encumbered_amount,
            'available_amount' => (float) $item->estimated_budget - (float) $item->encumbered_amount,
            'ppmp_no' => $item->document?->ppmp_no,
            'fund_source_id' => $item->fund_source_id,
            'lib_entry_id' => $item->lib_entry_id,
        ]);

        return response()->json(['data' => $items]);
    }

    private function recalculateDocumentTotals(PpmpDocument $doc): void
    {
        $items = PpmpItem::where('ppmp_document_id', $doc->id)->get();
        $doc->forceFill([
            'total_estimated_budget' => $items->sum('estimated_budget'),
            'row_count' => $items->count(),
        ])->save();
    }

    private function formatDocument(PpmpDocument $doc): array
    {
        return [
            'id' => $doc->id,
            'project_id' => $doc->project_id,
            'project_title' => $doc->project?->title,
            'fund_source_id' => $doc->fund_source_id,
            'fund_source_name' => $doc->fundSource?->name,
            'ppmp_no' => $doc->ppmp_no,
            'fiscal_year' => $doc->fiscal_year,
            'end_user_unit' => $doc->end_user_unit,
            'document_type' => $doc->document_type,
            'status' => $doc->status,
            'version' => $doc->version,
            'parent_id' => $doc->parent_id,
            'total_estimated_budget' => (float) $doc->total_estimated_budget,
            'row_count' => $doc->row_count,
            'approved_at' => $doc->approved_at?->toISOString(),
            'cancelled_at' => $doc->cancelled_at?->toISOString(),
            'cancellation_reason' => $doc->cancellation_reason,
            'created_at' => $doc->created_at?->toISOString(),
        ];
    }

    private function formatItem(PpmpItem $item): array
    {
        return [
            'id' => $item->id,
            'ppmp_document_id' => $item->ppmp_document_id,
            'lib_entry_id' => $item->lib_entry_id,
            'lib_account_code' => $item->libEntry?->account_code,
            'lib_fund_source' => $item->libEntry?->fundSource?->name,
            'fund_source_id' => $item->fund_source_id,
            'procurement_item_id' => $item->procurement_item_id,
            'item_name' => $item->item?->name,
            'code' => $item->code,
            'expense_category' => $item->expense_category,
            'general_description' => $item->general_description,
            'quantity' => (float) $item->quantity,
            'estimated_unit_cost' => (float) $item->estimated_unit_cost,
            'estimated_budget' => (float) $item->estimated_budget,
            'encumbered_amount' => (float) $item->encumbered_amount,
            'available_amount' => (float) $item->estimated_budget - (float) $item->encumbered_amount,
            'recommended_mode' => $item->recommended_mode,
            'schedule' => $item->schedule,
            'remarks' => $item->remarks,
        ];
    }

    private function audit(Request $request, string $action, mixed $target = null): void
    {
        $user = $request->user();

        AuditLog::create([
            'actor_id' => $user?->id,
            'actor_name' => $user?->name,
            'role' => $user?->roles->pluck('name')->implode(', '),
            'module' => 'PPMP',
            'action' => $action,
            'target' => $target === null ? null : (string) $target,
            'ip_address' => $request->ip(),
            'created_at' => now(),
        ]);
    }
}
