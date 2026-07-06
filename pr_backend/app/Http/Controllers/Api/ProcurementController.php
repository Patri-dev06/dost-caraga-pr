<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppCseItem;
use App\Models\AppNonCseItem;
use App\Models\ApprovalAction;
use App\Models\AuditLog;
use App\Models\BudgetAllocation;
use App\Models\FundSource;
use App\Models\Office;
use App\Models\PpmpDocument;
use App\Models\PpmpItem;
use App\Models\ProcurementItem;
use App\Models\Project;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\SystemPreference;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class ProcurementController extends Controller
{
    private const RESOURCE_MODELS = [
        'roles' => Role::class,
        'offices' => Office::class,
        'fund-sources' => FundSource::class,
        'projects' => Project::class,
        'procurement-items' => ProcurementItem::class,
        'purchase-requests' => PurchaseRequest::class,
        'users' => User::class,
    ];

    public function index(Request $request): JsonResponse
    {
        $resource = $this->resource($request);
        $query = $this->query($resource);
        $search = $request->query('search');

        if ($search) {
            $columns = Schema::getColumnListing($query->getModel()->getTable());
            $query->where(function (Builder $query) use ($search, $columns): void {
                foreach (['name', 'title', 'pr_no', 'email', 'code', 'purpose'] as $column) {
                    if (in_array($column, $columns, true)) {
                        $query->orWhere($column, 'like', "%{$search}%");
                    }
                }
            });
        }

        if ($resource === 'purchase-requests' && $request->query('status')) {
            $query->where('status', $request->query('status'));
        }

        if ($request->query('office_id')) {
            $query->where('office_id', $request->query('office_id'));
        }

        $data = $query->latest('id')->paginate((int) $request->query('per_page', 15));

        return response()->json($data);
    }

    public function store(Request $request): JsonResponse
    {
        $resource = $this->resource($request);

        if ($resource === 'purchase-requests') {
            return $this->storePurchaseRequest($request);
        }

        if ($resource === 'users') {
            return $this->storeUser($request);
        }

        $model = $this->model($resource);
        $record = $model::create($this->validated($request, $resource));
        $this->audit($request, 'References', 'Created '.str($resource)->headline(), $record->getKey());

        return response()->json($record, 201);
    }

    public function show(Request $request, int $resourceId): JsonResponse
    {
        $record = $this->query($this->resource($request))->findOrFail($resourceId);

        return response()->json(['data' => $this->format($record)]);
    }

    public function update(Request $request, int $resourceId): JsonResponse
    {
        $resource = $this->resource($request);

        if ($resource === 'purchase-requests') {
            return $this->updatePurchaseRequest($request, $resourceId);
        }

        $record = $this->query($resource)->findOrFail($resourceId);
        $record->fill($this->validated($request, $resource, true))->save();

        if ($record instanceof User && $request->has('role_ids')) {
            $record->roles()->sync($request->input('role_ids', []));
        }

        $this->audit($request, $resource === 'users' ? 'User Management' : 'References', 'Updated '.str($resource)->headline(), $resourceId);

        return response()->json(['data' => $this->format($record->fresh())]);
    }

    public function destroy(Request $request, int $resourceId): JsonResponse
    {
        $record = $this->query($this->resource($request))->findOrFail($resourceId);

        if ($record instanceof User) {
            $record->forceFill(['status' => 'Inactive'])->save();
        } else {
            $record->delete();
        }

        $this->audit($request, 'References', 'Deleted '.str($this->resource($request))->headline(), $resourceId);

        return response()->json(['message' => 'Record removed.']);
    }

    public function ppmpIndex(Project $project): JsonResponse
    {
        return response()->json([
            'data' => PpmpItem::with(['item', 'document'])
                ->whereBelongsTo($project)
                ->orderByDesc('ppmp_document_id')
                ->orderBy('row_number')
                ->orderBy('id')
                ->get(),
            'documents' => PpmpDocument::with(['items.item'])
                ->whereBelongsTo($project)
                ->latest('id')
                ->get()
                ->map(fn (PpmpDocument $document) => $this->formatPpmpDocument($document)),
        ]);
    }

    public function ppmpStore(Request $request, Project $project): JsonResponse
    {
        $data = validator($this->normalizedReferencePayload($request, false), [
            'procurement_item_id' => ['required', 'exists:procurement_items,id'],
            'code' => ['nullable', 'string'],
            'expense_category' => ['nullable', 'string'],
            'general_description' => ['nullable', 'string'],
            'project_type' => ['nullable', 'string'],
            'quantity_size' => ['nullable', 'string'],
            'recommended_mode' => ['nullable', 'string'],
            'pre_procurement_conference' => ['nullable', 'string'],
            'procurement_start' => ['nullable', 'string'],
            'procurement_end' => ['nullable', 'string'],
            'delivery_period' => ['nullable', 'string'],
            'source_of_funds' => ['nullable', 'string'],
            'estimated_budget' => ['nullable', 'numeric', 'min:0'],
            'supporting_documents' => ['nullable', 'string'],
            'remarks' => ['nullable', 'string'],
            'quantity' => ['required', 'numeric', 'min:0.01'],
            'estimated_unit_cost' => ['required', 'numeric', 'min:0'],
            'schedule' => ['nullable', 'string'],
        ])->validate();

        return response()->json(PpmpItem::create($data + ['project_id' => $project->id])->load('item'), 201);
    }

    public function ppmpDocumentStore(Request $request, Project $project): JsonResponse
    {
        $data = $request->validate([
            'document' => ['required', 'array'],
            'document.ppmp_no' => ['nullable', 'string'],
            'document.fiscal_year' => ['required', 'integer', 'between:2000,2100'],
            'document.end_user_unit' => ['nullable', 'string'],
            'document.document_type' => ['required', 'string', Rule::in(['Indicative', 'Final'])],
            'document.source_filename' => ['nullable', 'string'],
            'document.prepared_submitted_by_name' => ['nullable', 'string'],
            'document.prepared_submitted_by_position' => ['nullable', 'string'],
            'document.prepared_submitted_by_date' => ['nullable', 'date'],
            'document.budget_officer_name' => ['nullable', 'string'],
            'document.budget_officer_position' => ['nullable', 'string'],
            'document.budget_certified_date' => ['nullable', 'date'],
            'rows' => ['required', 'array', 'min:1'],
            'rows.*.row_number' => ['nullable', 'integer', 'min:1'],
            'rows.*.code' => ['nullable', 'string'],
            'rows.*.expense_category' => ['nullable', 'string'],
            'rows.*.general_description' => ['nullable', 'string'],
            'rows.*.project_type' => ['nullable', 'string'],
            'rows.*.item_name' => ['required', 'string'],
            'rows.*.uom' => ['nullable', 'string'],
            'rows.*.quantity' => ['nullable', 'numeric', 'min:0.01'],
            'rows.*.quantity_size' => ['nullable', 'string'],
            'rows.*.recommended_mode' => ['nullable', 'string'],
            'rows.*.pre_procurement_conference' => ['nullable', 'string'],
            'rows.*.procurement_start' => ['nullable', 'string'],
            'rows.*.procurement_end' => ['nullable', 'string'],
            'rows.*.delivery_period' => ['nullable', 'string'],
            'rows.*.source_of_funds' => ['nullable', 'string'],
            'rows.*.estimated_budget' => ['nullable', 'numeric', 'min:0'],
            'rows.*.supporting_documents' => ['nullable', 'string'],
            'rows.*.remarks' => ['nullable', 'string'],
        ]);

        $document = DB::transaction(function () use ($data, $project, $request): PpmpDocument {
            $document = PpmpDocument::create([
                'project_id' => $project->id,
                'ppmp_no' => $data['document']['ppmp_no'] ?? null,
                'fiscal_year' => $data['document']['fiscal_year'],
                'end_user_unit' => $data['document']['end_user_unit'] ?? null,
                'document_type' => $data['document']['document_type'],
                'source_filename' => $data['document']['source_filename'] ?? null,
                'prepared_submitted_by_name' => $data['document']['prepared_submitted_by_name'] ?? null,
                'prepared_submitted_by_position' => $data['document']['prepared_submitted_by_position'] ?? null,
                'prepared_submitted_by_date' => $data['document']['prepared_submitted_by_date'] ?? null,
                'budget_officer_name' => $data['document']['budget_officer_name'] ?? null,
                'budget_officer_position' => $data['document']['budget_officer_position'] ?? null,
                'budget_certified_date' => $data['document']['budget_certified_date'] ?? null,
                'imported_by' => $request->user()?->id,
                'imported_at' => now(),
            ]);

            $total = 0.0;
            $rowCount = 0;

            foreach ($data['rows'] as $row) {
                $quantity = $this->quantityFromPpmpRow($row);
                $estimatedBudget = $this->numericOrNull($row['estimated_budget'] ?? null) ?? 0.0;
                $unitCost = $quantity > 0 ? $estimatedBudget / $quantity : $estimatedBudget;
                $itemId = $this->resolveOrCreateProcurementItemId($row['item_name'], [
                    'description' => $row['quantity_size'] ?? null,
                    'category' => $row['expense_category'] ?? null,
                    'uom' => $row['uom'] ?? 'unit',
                    'is_cse' => false,
                ]);

                PpmpItem::create([
                    'ppmp_document_id' => $document->id,
                    'project_id' => $project->id,
                    'procurement_item_id' => $itemId,
                    'row_number' => $row['row_number'] ?? null,
                    'code' => $row['code'] ?? null,
                    'expense_category' => $row['expense_category'] ?? null,
                    'general_description' => $row['general_description'] ?? null,
                    'project_type' => $row['project_type'] ?? null,
                    'quantity_size' => $row['quantity_size'] ?? null,
                    'recommended_mode' => $row['recommended_mode'] ?? null,
                    'pre_procurement_conference' => $row['pre_procurement_conference'] ?? null,
                    'procurement_start' => $row['procurement_start'] ?? null,
                    'procurement_end' => $row['procurement_end'] ?? null,
                    'delivery_period' => $row['delivery_period'] ?? null,
                    'source_of_funds' => $row['source_of_funds'] ?? null,
                    'estimated_budget' => $estimatedBudget,
                    'supporting_documents' => $row['supporting_documents'] ?? null,
                    'remarks' => $row['remarks'] ?? null,
                    'quantity' => $quantity,
                    'estimated_unit_cost' => $unitCost,
                    'schedule' => $this->scheduleFromPpmpRow($row),
                ]);

                $total += $estimatedBudget;
                $rowCount++;
            }

            $document->forceFill([
                'total_estimated_budget' => $total,
                'row_count' => $rowCount,
            ])->save();

            return $document;
        });

        $this->audit($request, 'References', 'Imported PPMP Document', $document->ppmp_no ?: 'PPMP #'.$document->id);

        return response()->json(['data' => $this->formatPpmpDocument($document->fresh(['items.item']))], 201);
    }

    private function quantityFromPpmpRow(array $row): float
    {
        $quantity = $this->numericOrNull($row['quantity'] ?? null);

        if ($quantity !== null && $quantity > 0) {
            return $quantity;
        }

        $quantitySize = (string) ($row['quantity_size'] ?? '');
        if (preg_match('/quantity\s*:\s*([0-9,]+(?:\.[0-9]+)?)/i', $quantitySize, $matches)) {
            return max(0.01, (float) str_replace(',', '', $matches[1]));
        }

        return 1.0;
    }

    private function numericOrNull(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_numeric($value)) {
            return (float) $value;
        }

        $normalized = preg_replace('/[^0-9.\-]/', '', (string) $value);

        return $normalized === '' || ! is_numeric($normalized) ? null : (float) $normalized;
    }

    private function scheduleFromPpmpRow(array $row): ?string
    {
        $start = trim((string) ($row['procurement_start'] ?? ''));
        $end = trim((string) ($row['procurement_end'] ?? ''));
        $delivery = trim((string) ($row['delivery_period'] ?? ''));

        if ($start && $end && $start !== $end) {
            return "{$start} to {$end}".($delivery ? " / {$delivery}" : '');
        }

        return $start ?: ($end ?: ($delivery ?: null));
    }

    private function formatPpmpDocument(PpmpDocument $document): array
    {
        $document->loadMissing(['project', 'items.item']);

        return [
            'id' => $document->id,
            'project_id' => $document->project_id,
            'project_title' => $document->project?->title,
            'ppmp_no' => $document->ppmp_no,
            'fiscal_year' => $document->fiscal_year,
            'end_user_unit' => $document->end_user_unit,
            'document_type' => $document->document_type,
            'source_filename' => $document->source_filename,
            'prepared_submitted_by_name' => $document->prepared_submitted_by_name,
            'prepared_submitted_by_position' => $document->prepared_submitted_by_position,
            'prepared_submitted_by_date' => $document->prepared_submitted_by_date?->toDateString(),
            'budget_officer_name' => $document->budget_officer_name,
            'budget_officer_position' => $document->budget_officer_position,
            'budget_certified_date' => $document->budget_certified_date?->toDateString(),
            'total_estimated_budget' => $document->total_estimated_budget,
            'row_count' => $document->row_count,
            'imported_at' => $document->imported_at?->toISOString(),
            'items' => $document->items
                ->sortBy([['row_number', 'asc'], ['id', 'asc']])
                ->values()
                ->map(fn (PpmpItem $item) => $this->formatPpmpItem($item))
                ->all(),
        ];
    }

    private function formatPpmpItem(PpmpItem $item): array
    {
        $item->loadMissing('item');

        return [
            'id' => $item->id,
            'ppmp_document_id' => $item->ppmp_document_id,
            'project_id' => $item->project_id,
            'procurement_item_id' => $item->procurement_item_id,
            'row_number' => $item->row_number,
            'code' => $item->code,
            'expense_category' => $item->expense_category,
            'general_description' => $item->general_description,
            'project_type' => $item->project_type,
            'quantity_size' => $item->quantity_size,
            'recommended_mode' => $item->recommended_mode,
            'pre_procurement_conference' => $item->pre_procurement_conference,
            'procurement_start' => $item->procurement_start,
            'procurement_end' => $item->procurement_end,
            'delivery_period' => $item->delivery_period,
            'source_of_funds' => $item->source_of_funds,
            'estimated_budget' => $item->estimated_budget,
            'supporting_documents' => $item->supporting_documents,
            'remarks' => $item->remarks,
            'quantity' => $item->quantity,
            'estimated_unit_cost' => $item->estimated_unit_cost,
            'schedule' => $item->schedule,
            'item' => $item->item,
        ];
    }

    public function appCseIndex(?Project $project = null): JsonResponse
    {
        $query = AppCseItem::with('item');
        $project ? $query->whereBelongsTo($project) : $query->whereNull('project_id');

        return response()->json(['data' => $query->get()]);
    }

    public function appCseStore(Request $request, ?Project $project = null): JsonResponse
    {
        $data = validator($this->normalizedReferencePayload($request, true), [
            'procurement_item_id' => ['required', 'exists:procurement_items,id'],
            'code' => ['nullable', 'string'],
            'quantity' => ['required', 'numeric', 'min:0.01'],
            'unit_price' => ['required', 'numeric', 'min:0'],
        ])->validate();

        return response()->json(AppCseItem::create($data + ['project_id' => $project?->id])->load('item'), 201);
    }

    public function appNonCseIndex(?Project $project = null): JsonResponse
    {
        $query = AppNonCseItem::with('item');
        $project ? $query->whereBelongsTo($project) : $query->whereNull('project_id');

        return response()->json(['data' => $query->get()]);
    }

    public function appNonCseStore(Request $request, ?Project $project = null): JsonResponse
    {
        $data = validator($this->normalizedReferencePayload($request, false), [
            'procurement_item_id' => ['required', 'exists:procurement_items,id'],
            'code' => ['nullable', 'string'],
            'quantity' => ['required', 'numeric', 'min:0.01'],
            'estimated_cost' => ['required', 'numeric', 'min:0'],
        ])->validate();

        return response()->json(AppNonCseItem::create($data + ['project_id' => $project?->id])->load('item'), 201);
    }

    private function normalizedReferencePayload(Request $request, bool $isCse): array
    {
        $data = $request->all();
        $itemName = $data['item_name'] ?? $data['item'] ?? $data['name'] ?? null;

        if (! ($data['procurement_item_id'] ?? null) && $itemName) {
            $data['procurement_item_id'] = $this->resolveOrCreateProcurementItemId($itemName, [
                'description' => $data['description'] ?? null,
                'category' => $data['category'] ?? null,
                'uom' => $data['uom'] ?? $data['unit'] ?? 'unit',
                'is_cse' => $isCse,
            ]);
        }

        return $data;
    }

    public function budgetShow(Project $project): JsonResponse
    {
        $budgets = BudgetAllocation::whereBelongsTo($project)->get();

        return response()->json([
            'total' => (float) $budgets->sum('allocated_amount'),
            'used' => (float) $budgets->sum('obligated_amount'),
            'available' => (float) ($budgets->sum('allocated_amount') - $budgets->sum('obligated_amount')),
            'data' => $budgets,
        ]);
    }

    public function budgetStore(Request $request, Project $project): JsonResponse
    {
        $data = $request->validate([
            'account_code' => ['required', 'string'],
            'account_name' => ['required', 'string'],
            'allocated_amount' => ['required', 'numeric', 'min:0'],
            'obligated_amount' => ['nullable', 'numeric', 'min:0'],
        ]);
        $data['obligated_amount'] = $data['obligated_amount'] ?? 0;

        $budget = BudgetAllocation::create($data + [
            'project_id' => $project->id,
        ]);

        $this->audit($request, 'References', 'Created Budget Allocation', $budget->account_code);

        return response()->json($budget, 201);
    }

    public function checkPpmp(Request $request): JsonResponse
    {
        $data = $this->validatedCheckPayload($request, false, true);

        return response()->json([
            'data' => $this->ppmpCheck(
                (int) $data['project_id'],
                $data['procurement_item_id'] ?? null,
                $data['name'] ?? null
            ),
        ]);
    }

    public function checkLineItemBudget(Request $request): JsonResponse
    {
        $data = $this->validatedCheckPayload($request, true, false);

        return response()->json([
            'data' => $this->lineItemBudgetCheck(
                (int) $data['project_id'],
                $this->requestedAmount($data),
                $data['account_code'] ?? null
            ),
        ]);
    }

    public function checkPpmpAndLib(Request $request): JsonResponse
    {
        $data = $this->validatedCheckPayload($request, true, true);

        return response()->json([
            'data' => [
                $this->ppmpCheck(
                    (int) $data['project_id'],
                    $data['procurement_item_id'] ?? null,
                    $data['name'] ?? null
                ),
                $this->lineItemBudgetCheck(
                    (int) $data['project_id'],
                    $this->requestedAmount($data),
                    $data['account_code'] ?? null
                ),
            ],
        ]);
    }

    public function validatePurchaseRequest(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $purchaseRequest->load('items.item', 'project', 'fundSource');
        $purchaseRequest->validationResults()->delete();

        $results = [];
        foreach ($purchaseRequest->items as $item) {
            foreach ($this->checksFor($purchaseRequest, $item) as $check) {
                $results[] = $purchaseRequest->validationResults()->create($check + [
                    'purchase_request_item_id' => $item->id,
                ]);
            }
        }

        $failed = collect($results)->contains(fn ($result) => $result->status === 'Failed');
        $purchaseRequest->forceFill([
            'status' => $failed ? 'Returned' : 'Pending Validation',
            'stage' => $failed ? 'Returned by Validator' : 'Pre-Validation',
        ])->save();

        $this->audit($request, 'Validation', 'Validated Items', $purchaseRequest->pr_no);

        return response()->json([
            'status' => $failed ? 'Failed' : 'Passed',
            'errors' => collect($results)->where('status', 'Failed')->values(),
            'warnings' => collect($results)->where('status', 'Warning')->values(),
            'data' => $results,
        ]);
    }

    public function submitPurchaseRequest(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $validation = $this->validatePurchaseRequest($request, $purchaseRequest)->getData(true);

        if ($validation['status'] === 'Failed') {
            return response()->json(['message' => 'Purchase Request cannot proceed until validation failures are resolved.', 'validation' => $validation], 422);
        }

        $purchaseRequest->forceFill([
            'status' => 'For Recommendation',
            'stage' => $this->preferenceValue('recommending_approval_stage', 'Division Chief Recommendation'),
            'submitted_at' => now(),
        ])->save();

        $this->recordAction($request, $purchaseRequest, 'Requester', 'Submitted PR', 'Initial submission.');

        return response()->json(['message' => 'Purchase Request submitted for recommendation.', 'data' => $this->format($purchaseRequest->fresh())]);
    }

    public function approvals(): JsonResponse
    {
        return response()->json([
            'data' => PurchaseRequest::with(['office', 'fundSource', 'project', 'items'])
                ->whereIn('status', ['For Recommendation', 'For Approval'])
                ->latest('id')
                ->get()
                ->map(fn ($pr) => $this->format($pr)),
        ]);
    }

    public function recommend(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $purchaseRequest->forceFill([
            'status' => 'For Approval',
            'stage' => $this->preferenceValue('rd_approval_stage', 'Director Approval'),
        ])->save();
        $this->recordAction($request, $purchaseRequest, 'Recommender', 'Recommended', $request->input('remarks'));

        return response()->json(['message' => 'Purchase Request recommended.', 'data' => $this->format($purchaseRequest->fresh())]);
    }

    public function approve(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $purchaseRequest->forceFill(['status' => 'Approved', 'stage' => 'Approved'])->save();
        $this->recordAction($request, $purchaseRequest, 'Approver', 'Approved', $request->input('remarks'));

        return response()->json(['message' => 'Purchase Request approved.', 'data' => $this->format($purchaseRequest->fresh())]);
    }

    public function reject(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string']]);
        $purchaseRequest->forceFill(['status' => 'Rejected', 'stage' => 'Rejected'])->save();
        $this->recordAction($request, $purchaseRequest, 'Approver', 'Rejected', $data['reason']);

        return response()->json(['message' => 'Purchase Request rejected.', 'data' => $this->format($purchaseRequest->fresh())]);
    }

    public function auditLogs(Request $request): JsonResponse
    {
        $timezone = config('app.timezone', 'Asia/Manila');
        $logs = AuditLog::latest('created_at')
            ->paginate((int) $request->query('per_page', 15))
            ->through(function (AuditLog $log) use ($timezone): array {
                return [
                    'id' => $log->id,
                    'actor_id' => $log->actor_id,
                    'actor_name' => $log->actor_name,
                    'role' => $log->role,
                    'module' => $log->module,
                    'action' => $log->action,
                    'target' => $log->target,
                    'ip_address' => $log->ip_address,
                    'created_at' => $log->created_at?->timezone($timezone)->format('Y-m-d\TH:i:sP'),
                    'timezone' => $timezone,
                ];
            });

        return response()->json($logs);
    }

    public function systemSettings(): JsonResponse
    {
        $this->ensureDefaultSystemPreferences();

        return response()->json([
            'data' => SystemPreference::orderBy('category')->orderBy('id')->get(),
        ]);
    }

    public function updateSystemSettings(Request $request): JsonResponse
    {
        abort_unless($request->user()?->roles->contains('name', 'Admin'), 403, 'Only administrators can update system preferences.');

        $data = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*.key' => ['required', 'string', 'exists:system_preferences,key'],
            'settings.*.value' => ['nullable'],
        ]);

        foreach ($data['settings'] as $setting) {
            SystemPreference::where('key', $setting['key'])->update([
                'value' => $this->normalizePreferenceValue($setting['value'] ?? null),
            ]);
        }

        $this->audit($request, 'System Settings', 'Updated Preferences', collect($data['settings'])->pluck('key')->implode(', '));

        return $this->systemSettings();
    }

    private function storePurchaseRequest(Request $request): JsonResponse
    {
        $data = validator($this->normalizedPurchaseRequestPayload($request), [
            'office_id' => ['required', 'exists:offices,id'],
            'fund_source_id' => ['required', 'exists:fund_sources,id'],
            'project_id' => ['nullable', 'exists:projects,id'],
            'requested_by' => ['nullable', 'exists:users,id'],
            'mode_of_procurement' => ['required', 'string'],
            'purpose' => ['required', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.procurement_item_id' => ['nullable', 'exists:procurement_items,id'],
            'items.*.name' => ['required', 'string'],
            'items.*.description' => ['nullable', 'string'],
            'items.*.uom' => ['required', 'string'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.01'],
            'items.*.unit_cost' => ['required', 'numeric', 'min:0'],
            'submit' => ['sometimes', 'boolean'],
        ])->validate();

        $purchaseRequest = DB::transaction(function () use ($data, $request): PurchaseRequest {
            $pr = PurchaseRequest::create([
                'pr_no' => $this->nextPrNo(),
                'office_id' => $data['office_id'],
                'fund_source_id' => $data['fund_source_id'],
                'project_id' => $data['project_id'] ?? null,
                'requested_by' => $data['requested_by'] ?? $request->user()->id,
                'mode_of_procurement' => $data['mode_of_procurement'],
                'purpose' => $data['purpose'],
            ]);

            $pr->items()->createMany($data['items']);

            return $pr;
        });

        $this->audit($request, 'Purchase Requests', 'Created PR', $purchaseRequest->pr_no);

        if ($data['submit'] ?? false) {
            $validation = $this->validatePurchaseRequest($request, $purchaseRequest)->getData(true);

            if ($validation['status'] === 'Failed') {
                return response()->json([
                    'message' => 'Purchase Request was saved as draft but cannot proceed until validation failures are resolved.',
                    'validation' => $validation,
                    'data' => $this->format($purchaseRequest->fresh()),
                ], 422);
            }

            $purchaseRequest->forceFill([
                'status' => 'For Recommendation',
                'stage' => $this->preferenceValue('recommending_approval_stage', 'Division Chief Recommendation'),
                'submitted_at' => now(),
            ])->save();
            $this->recordAction($request, $purchaseRequest, 'Requester', 'Submitted PR', 'Initial submission.');
        }

        return response()->json(['data' => $this->format($purchaseRequest->fresh())], 201);
    }

    private function normalizedPurchaseRequestPayload(Request $request): array
    {
        $data = $request->all();

        $data['office_id'] = $data['office_id'] ?? $this->resolveOfficeId($data['office_code'] ?? $data['office'] ?? null);
        $data['fund_source_id'] = $data['fund_source_id'] ?? $this->resolveFundSourceId($data['fund_source'] ?? $data['fundSource'] ?? $data['source_of_funds'] ?? null);
        $data['project_id'] = $data['project_id'] ?? $this->resolveProjectId($data['project_code'] ?? $data['project_title'] ?? $data['projectTitle'] ?? $data['project'] ?? null);
        $data['requested_by'] = $data['requested_by'] ?? $data['requestedBy'] ?? $data['requester_id'] ?? $data['requesterId'] ?? null;
        $data['mode_of_procurement'] = $data['mode_of_procurement'] ?? $data['modeOfProcurement'] ?? null;

        $data['items'] = collect($data['items'] ?? [])->map(function (array $item): array {
            $name = $item['name'] ?? $item['item'] ?? null;
            $procurementItemId = $item['procurement_item_id'] ?? $item['procurementItemId'] ?? $item['item_id'] ?? null;

            if (! $procurementItemId && $name) {
                $procurementItemId = $this->resolveProcurementItemId($name);
            }

            return [
                'procurement_item_id' => $procurementItemId,
                'name' => $name,
                'description' => $item['description'] ?? null,
                'uom' => $item['uom'] ?? $item['unit'] ?? 'unit',
                'quantity' => $item['quantity'] ?? $item['qty'] ?? null,
                'unit_cost' => $item['unit_cost'] ?? $item['unitCost'] ?? $item['price'] ?? null,
            ];
        })->all();

        return $data;
    }

    private function resolveOfficeId(mixed $value): ?int
    {
        if (! $value) {
            return null;
        }

        $needle = mb_strtolower((string) $value);

        return Office::whereRaw('LOWER(code) = ?', [$needle])
            ->orWhereRaw('LOWER(name) = ?', [$needle])
            ->value('id');
    }

    private function resolveFundSourceId(mixed $value): ?int
    {
        if (! $value) {
            return null;
        }

        $needle = mb_strtolower((string) $value);

        return FundSource::whereRaw('LOWER(name) = ?', [$needle])
            ->orWhereRaw('LOWER(fund_type) = ?', [$needle])
            ->value('id');
    }

    private function resolveProjectId(mixed $value): ?int
    {
        if (! $value) {
            return null;
        }

        $needle = mb_strtolower((string) $value);

        return Project::whereRaw('LOWER(code) = ?', [$needle])
            ->orWhereRaw('LOWER(title) = ?', [$needle])
            ->value('id');
    }

    private function resolveProcurementItemId(string $name): ?int
    {
        $needle = mb_strtolower($name);

        return ProcurementItem::whereRaw('LOWER(name) = ?', [$needle])->value('id');
    }

    private function resolveOrCreateProcurementItemId(string $name, array $attributes): int
    {
        $needle = mb_strtolower($name);
        $item = ProcurementItem::whereRaw('LOWER(name) = ?', [$needle])->first();

        if ($item) {
            $item->fill(array_filter([
                'description' => $item->description ?: ($attributes['description'] ?? null),
                'category' => $item->category ?: ($attributes['category'] ?? null),
                'uom' => $item->uom ?: ($attributes['uom'] ?? 'unit'),
                'is_cse' => ($attributes['is_cse'] ?? false) ? true : $item->is_cse,
            ], fn ($value) => $value !== null))->save();

            return $item->id;
        }

        return ProcurementItem::create([
            'name' => $name,
            'description' => $attributes['description'] ?? null,
            'category' => $attributes['category'] ?? null,
            'uom' => $attributes['uom'] ?? 'unit',
            'is_cse' => $attributes['is_cse'] ?? false,
            'active' => true,
        ])->id;
    }

    private function updatePurchaseRequest(Request $request, int $id): JsonResponse
    {
        $purchaseRequest = PurchaseRequest::findOrFail($id);
        abort_if(! in_array($purchaseRequest->status, ['Draft', 'Returned'], true), 422, 'Only draft or returned purchase requests may be edited.');

        $data = validator($this->normalizedPurchaseRequestPayload($request), [
            'office_id' => ['sometimes', 'exists:offices,id'],
            'fund_source_id' => ['sometimes', 'exists:fund_sources,id'],
            'project_id' => ['nullable', 'exists:projects,id'],
            'mode_of_procurement' => ['sometimes', 'string'],
            'purpose' => ['sometimes', 'string'],
            'items' => ['sometimes', 'array', 'min:1'],
            'items.*.procurement_item_id' => ['nullable', 'exists:procurement_items,id'],
            'items.*.name' => ['required_with:items', 'string'],
            'items.*.description' => ['nullable', 'string'],
            'items.*.uom' => ['required_with:items', 'string'],
            'items.*.quantity' => ['required_with:items', 'numeric', 'min:0.01'],
            'items.*.unit_cost' => ['required_with:items', 'numeric', 'min:0'],
        ])->validate();

        DB::transaction(function () use ($data, $purchaseRequest): void {
            $items = $data['items'] ?? null;
            unset($data['items']);
            $purchaseRequest->fill($data)->save();

            if ($items !== null) {
                $purchaseRequest->items()->delete();
                $purchaseRequest->items()->createMany($items);
            }
        });

        $this->audit($request, 'Purchase Requests', 'Updated PR', $purchaseRequest->pr_no);

        return response()->json(['data' => $this->format($purchaseRequest->fresh())]);
    }

    private function storeUser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string'],
            'email' => ['required', 'email', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:8'],
            'office_id' => ['nullable', 'exists:offices,id'],
            'role_ids' => ['array'],
            'role_ids.*' => ['exists:roles,id'],
            'status' => ['sometimes', 'string'],
        ]);

        $roleIds = $data['role_ids'] ?? [];
        unset($data['role_ids']);
        $data['password'] = Hash::make($data['password']);
        $user = User::create($data);
        $user->roles()->sync($roleIds);
        $this->audit($request, 'User Management', 'Created User', $user->email);

        return response()->json(['data' => $user->load('office', 'roles')], 201);
    }

    private function checksFor(PurchaseRequest $pr, $item): array
    {
        $projectId = $pr->project_id;
        $procurementItemId = $item->procurement_item_id;
        $name = mb_strtolower($item->name);
        $amount = (float) $item->quantity * (float) $item->unit_cost;
        $cse = AppCseItem::where(function ($query) use ($projectId): void {
            $query->whereNull('project_id')->orWhere('project_id', $projectId);
        })->where('procurement_item_id', $procurementItemId)->exists();
        $nonCse = AppNonCseItem::where(function ($query) use ($projectId): void {
            $query->whereNull('project_id')->orWhere('project_id', $projectId);
        })->where('procurement_item_id', $procurementItemId)->exists();

        if (! $procurementItemId) {
            $cse = AppCseItem::whereHas('item', fn ($query) => $query->whereRaw('LOWER(name) like ?', ["%{$name}%"]))->exists();
            $nonCse = AppNonCseItem::whereHas('item', fn ($query) => $query->whereRaw('LOWER(name) like ?', ["%{$name}%"]))->exists();
        }

        return [
            $this->ppmpCheck($projectId, $procurementItemId, $item->name),
            $this->lineItemBudgetCheck($projectId, $amount),
            ['label' => 'APP-CSE', 'status' => $cse ? 'Passed' : 'N/A', 'message' => $cse ? 'Item matches an APP-CSE entry.' : 'Item is not found in APP-CSE.'],
            ['label' => 'APP-Non-CSE', 'status' => $nonCse ? 'Passed' : ($cse ? 'N/A' : 'Failed'), 'message' => $nonCse ? 'Item matches an APP-Non-CSE entry.' : ($cse ? 'Not applicable; item is CSE.' : 'Item is not found in APP-Non-CSE.')],
        ];
    }

    private function validatedCheckPayload(Request $request, bool $withAmount, bool $withItem): array
    {
        $rules = [
            'project_id' => ['required', 'exists:projects,id'],
            'procurement_item_id' => ['nullable', 'exists:procurement_items,id'],
            'name' => ['nullable', 'string'],
        ];

        if ($withItem) {
            $rules['procurement_item_id'][] = 'required_without:name';
            $rules['name'][] = 'required_without:procurement_item_id';
        }

        if ($withAmount) {
            $rules += [
                'account_code' => ['nullable', 'string'],
                'amount' => ['nullable', 'numeric', 'min:0'],
                'quantity' => ['required_without:amount', 'numeric', 'min:0'],
                'unit_cost' => ['required_without:amount', 'numeric', 'min:0'],
            ];
        }

        return $request->validate($rules);
    }

    private function requestedAmount(array $data): float
    {
        if (array_key_exists('amount', $data) && $data['amount'] !== null) {
            return (float) $data['amount'];
        }

        return (float) $data['quantity'] * (float) $data['unit_cost'];
    }

    private function ppmpCheck(?int $projectId, ?int $procurementItemId, ?string $name): array
    {
        if (! $projectId) {
            return [
                'label' => 'PPMP',
                'status' => 'Warning',
                'message' => 'Project is required before PPMP can be checked.',
                'matched' => null,
            ];
        }

        $query = PpmpItem::with('item')->where('project_id', $projectId);

        if ($procurementItemId) {
            $query->where('procurement_item_id', $procurementItemId);
        } else {
            $needle = mb_strtolower((string) $name);
            $query->whereHas('item', fn ($query) => $query->whereRaw('LOWER(name) like ?', ["%{$needle}%"]));
        }

        $ppmpItem = $query->first();

        return [
            'label' => 'PPMP',
            'status' => $ppmpItem ? 'Passed' : 'Warning',
            'message' => $ppmpItem ? 'Item is included in PPMP.' : 'Item is not found in the approved PPMP.',
            'matched' => $ppmpItem,
        ];
    }

    private function lineItemBudgetCheck(?int $projectId, float $requestedAmount, ?string $accountCode = null): array
    {
        if (! $projectId) {
            return [
                'label' => 'Line-Item Budget',
                'status' => 'Failed',
                'message' => 'Project is required before Line-Item Budget can be checked.',
                'requested_amount' => $requestedAmount,
                'available' => 0.0,
            ];
        }

        $query = BudgetAllocation::where('project_id', $projectId);

        if ($accountCode) {
            $query->where('account_code', $accountCode);
        }

        $budgets = $query->get();
        $allocated = (float) $budgets->sum('allocated_amount');
        $obligated = (float) $budgets->sum('obligated_amount');
        $available = $allocated - $obligated;
        $hasBudget = $budgets->isNotEmpty();
        $passed = $hasBudget && $requestedAmount <= $available;

        return [
            'label' => 'Line-Item Budget',
            'status' => $passed ? 'Passed' : 'Failed',
            'message' => $passed
                ? 'Item is within approved budget.'
                : ($hasBudget ? 'Item exceeds available budget allocation.' : 'No budget allocation was found for this project.'),
            'requested_amount' => $requestedAmount,
            'allocated' => $allocated,
            'obligated' => $obligated,
            'available' => $available,
            'account_code' => $accountCode,
        ];
    }

    private function validated(Request $request, string $resource, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return match ($resource) {
            'roles' => $request->validate(['name' => [$required, 'string'], 'description' => ['nullable', 'string'], 'permissions' => ['nullable', 'array']]),
            'offices' => $request->validate(['name' => [$required, 'string'], 'code' => ['nullable', 'string'], 'description' => ['nullable', 'string']]),
            'fund-sources' => $request->validate(['name' => [$required, 'string'], 'fund_type' => [$required, 'string'], 'description' => ['nullable', 'string'], 'active' => ['sometimes', 'boolean']]),
            'projects' => $request->validate(['office_id' => ['nullable', 'exists:offices,id'], 'fund_source_id' => ['nullable', 'exists:fund_sources,id'], 'code' => [$required, 'string'], 'title' => [$required, 'string'], 'description' => ['nullable', 'string'], 'fiscal_year' => [$required, 'integer'], 'status' => ['sometimes', 'string']]),
            'procurement-items' => $request->validate(['name' => [$required, 'string'], 'description' => ['nullable', 'string'], 'category' => ['nullable', 'string'], 'uom' => [$required, 'string'], 'is_cse' => ['sometimes', 'boolean'], 'active' => ['sometimes', 'boolean']]),
            'users' => $request->validate(['name' => ['sometimes', 'string'], 'email' => ['sometimes', 'email'], 'office_id' => ['nullable', 'exists:offices,id'], 'role_ids' => ['array'], 'role_ids.*' => ['exists:roles,id'], 'status' => ['sometimes', 'string']]),
            default => [],
        };
    }

    private function query(string $resource): Builder
    {
        $model = $this->model($resource);
        $query = $model::query();

        return match ($resource) {
            'users' => $query->with('office', 'roles'),
            'projects' => $query->with('office', 'fundSource'),
            'purchase-requests' => $query->with(['office', 'fundSource', 'project', 'requester', 'items', 'validationResults', 'approvalActions']),
            default => $query,
        };
    }

    private function model(string $resource): string
    {
        abort_unless(isset(self::RESOURCE_MODELS[$resource]), 404, 'Unknown API resource.');

        return self::RESOURCE_MODELS[$resource];
    }

    private function resource(Request $request): string
    {
        return (string) $request->route('resource');
    }

    private function format(Model $record): mixed
    {
        if (! $record instanceof PurchaseRequest) {
            return $record;
        }

        $record->loadMissing(['office', 'fundSource', 'project', 'requester', 'items', 'validationResults', 'approvalActions']);

        return [
            'id' => $record->id,
            'pr_no' => $record->pr_no,
            'office' => $record->office?->name,
            'fund_source' => $record->fundSource?->name,
            'fund_type' => $record->fundSource?->fund_type,
            'amount' => $record->items->sum(fn ($item) => (float) $item->quantity * (float) $item->unit_cost),
            'status' => $record->status,
            'stage' => $record->stage,
            'date_submitted' => $record->submitted_at?->toDateString(),
            'requested_by' => $record->requester ? [
                'id' => $record->requester->id,
                'name' => $record->requester->name,
                'email' => $record->requester->email,
            ] : null,
            'mode_of_procurement' => $record->mode_of_procurement,
            'project_title' => $record->project?->title,
            'purpose' => $record->purpose,
            'items' => $record->items,
            'validation' => $record->validationResults,
            'approval_trail' => $record->approvalActions,
        ];
    }

    private function recordAction(Request $request, PurchaseRequest $purchaseRequest, string $role, string $action, ?string $remarks): void
    {
        ApprovalAction::create([
            'purchase_request_id' => $purchaseRequest->id,
            'user_id' => $request->user()->id,
            'role' => $role,
            'action' => $action,
            'remarks' => $remarks,
        ]);

        $this->audit($request, $role === 'Requester' ? 'Purchase Requests' : 'Approval Inbox', $action, $purchaseRequest->pr_no);
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
                'key' => 'email_notifications_enabled',
                'value' => ['value' => true],
                'category' => 'Notifications',
                'label' => 'Email Notifications',
                'description' => 'Enable email notifications for submissions, returns, and approvals.',
                'type' => 'boolean',
            ],
        ];
    }

    private function nextPrNo(): string
    {
        $year = now()->year;
        $count = PurchaseRequest::whereYear('created_at', $year)->count() + 1;

        return sprintf('PR-%d-%04d', $year, $count);
    }
}
