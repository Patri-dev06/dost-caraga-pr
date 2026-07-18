<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppCseItem;
use App\Models\AppNonCseItem;
use App\Models\ApprovalAction;
use App\Models\AuditLog;
use App\Models\BudgetAllocation;
use App\Models\FundSource;
use App\Models\LibDocument;
use App\Models\LibDocumentRow;
use App\Models\Office;
use App\Models\PpmpDocument;
use App\Models\PpmpItem;
use App\Models\ProcurementItem;
use App\Models\Project;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\SystemPreference;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
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

    /** Abort with 403 unless the current user may access the given module. */
    private function guardModule(string $module): void
    {
        abort_unless(request()->user()?->canAccessModule($module), 403, 'You do not have access to this module.');
    }

    /** Map a generic REST resource to the module that governs it, then enforce it. */
    private function guardResource(string $resource): void
    {
        if ($resource === 'users') {
            abort_unless(request()->user()?->tier === 'superadmin', 403, 'Only the Superadmin can manage users.');

            return;
        }

        $module = match ($resource) {
            'roles' => 'settings',
            'offices', 'fund-sources', 'projects', 'procurement-items' => 'references',
            'purchase-requests' => 'pr',
            default => null,
        };

        if ($module !== null) {
            $this->guardModule($module);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $resource = $this->resource($request);
        $this->guardResource($resource);
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

    /**
     * Lightweight list of approved accounts (status = Active) for signatory
     * pickers. Unlike the superadmin-only /users endpoint, any signed-in user may
     * read this, but it only exposes name/tier/suggested position — never
     * credentials or module grants.
     */
    public function signatories(Request $request): JsonResponse
    {
        $users = User::query()
            ->where('status', 'Active')
            ->with('roles:id,name')
            ->orderBy('name')
            ->get()
            ->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'tier' => $user->tier,
                // Prefer the self-reported position captured at sign-up; fall back to role.
                'position' => $user->position ?: $user->roles->pluck('name')->first(),
            ]);

        return response()->json(['data' => $users]);
    }

    /** The designated Budget Officer, for auto-filling PPMP fund-certification signatories. */
    public function budgetOfficer(Request $request): JsonResponse
    {
        $officer = $this->designatedBudgetOfficer();

        return response()->json([
            'data' => $officer ? [
                'id' => $officer->id,
                'name' => $officer->name,
                'position' => $officer->position ?: 'Budget Officer',
                'isCurrentUser' => $officer->id === $request->user()?->id,
            ] : null,
        ]);
    }

    public function notifications(Request $request): JsonResponse
    {
        $notifications = UserNotification::where('user_id', $request->user()?->id)
            ->latest()
            ->limit(50)
            ->get()
            ->map(fn (UserNotification $n): array => [
                'id' => $n->id,
                'type' => $n->type,
                'title' => $n->title,
                'body' => $n->body,
                'link' => $n->link,
                'data' => $n->data,
                'read' => $n->read_at !== null,
                'createdAt' => $n->created_at?->toISOString(),
            ]);

        return response()->json([
            'data' => $notifications,
            'unread' => UserNotification::where('user_id', $request->user()?->id)->whereNull('read_at')->count(),
        ]);
    }

    public function markNotificationRead(Request $request, int $id): JsonResponse
    {
        UserNotification::where('user_id', $request->user()?->id)->where('id', $id)->update(['read_at' => now()]);

        return response()->json(['message' => 'Notification marked as read.']);
    }

    public function markAllNotificationsRead(Request $request): JsonResponse
    {
        UserNotification::where('user_id', $request->user()?->id)->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['message' => 'All notifications marked as read.']);
    }

    public function planningLibIndex(Request $request): JsonResponse
    {
        $this->guardModule('lib');

        $query = LibDocument::with('rows')->latest('updated_at');
        $this->scopeLibVisibility($query);

        return response()->json(['data' => $query->get()->map(fn (LibDocument $document): array => $this->formatLibDocument($document))->all()]);
    }

    public function planningLibShow(Request $request, string $clientUid): JsonResponse
    {
        $this->guardModule('lib');
        $document = LibDocument::with('rows')->where('client_uid', $clientUid)->firstOrFail();

        $user = $request->user();
        $isOwner = $document->owner_id !== null && $document->owner_id === $user?->id;
        abort_unless(
            $user?->tier === 'superadmin' || $isOwner || in_array($document->id, $this->budgetOfficerLibIds($user), true),
            403,
            'You do not have access to this document.',
        );

        return response()->json(['data' => $this->formatLibDocument($document)]);
    }

    public function planningLibStore(Request $request, ?string $clientUid = null): JsonResponse
    {
        $this->guardModule('lib');

        $data = $request->validate([
            'id' => ['required', 'string'],
            'fiscalYear' => ['nullable', 'string'],
            'programTitle' => ['nullable', 'string'],
            'projectTitle' => ['nullable', 'string'],
            'implementingAgency' => ['nullable', 'string'],
            'totalDuration' => ['nullable', 'string'],
            'cooperatingAgency' => ['nullable', 'string'],
            'projectLeader' => ['nullable', 'string'],
            'monitoringAgency' => ['nullable', 'string'],
            'revision' => ['nullable', 'integer', 'min:0'],
            'chargeableNote' => ['nullable', 'string'],
            'preparedByName' => ['nullable', 'string'],
            'preparedByPosition' => ['nullable', 'string'],
            'recommendingName' => ['nullable', 'string'],
            'recommendingPosition' => ['nullable', 'string'],
            'certifiedName' => ['nullable', 'string'],
            'certifiedPosition' => ['nullable', 'string'],
            'approvedName' => ['nullable', 'string'],
            'approvedPosition' => ['nullable', 'string'],
            'status' => ['required', 'string'],
            'history' => ['nullable', 'array'],
            'rows' => ['required', 'array'],
            'rows.*.id' => ['required', 'string'],
            'rows.*.label' => ['nullable', 'string'],
            'rows.*.note' => ['nullable', 'string'],
            'rows.*.indent' => ['required', 'integer', 'min:0', 'max:2'],
            'rows.*.header' => ['required', 'boolean'],
            'rows.*.approved' => ['nullable', 'string'],
            'rows.*.reprogrammings' => ['nullable', 'array'],
            'createdAt' => ['nullable', 'date'],
        ]);

        $user = $request->user();
        $uid = $clientUid ?? $data['id'];

        $document = DB::transaction(function () use ($data, $uid, $user): LibDocument {
            $document = LibDocument::firstOrNew(['client_uid' => $uid]);
            if ($document->exists) {
                $this->abortUnlessOwned($document->owner_id);
            }

            $document->fill([
                'fiscal_year' => $data['fiscalYear'] ?? '',
                'program_title' => $data['programTitle'] ?? null,
                'project_title' => $data['projectTitle'] ?? null,
                'implementing_agency' => $data['implementingAgency'] ?? null,
                'total_duration' => $data['totalDuration'] ?? null,
                'cooperating_agency' => $data['cooperatingAgency'] ?? null,
                'project_leader' => $data['projectLeader'] ?? null,
                'monitoring_agency' => $data['monitoringAgency'] ?? null,
                'revision' => $data['revision'] ?? 0,
                'chargeable_note' => $data['chargeableNote'] ?? null,
                'prepared_by_name' => $data['preparedByName'] ?? null,
                'prepared_by_position' => $data['preparedByPosition'] ?? null,
                'recommending_name' => $data['recommendingName'] ?? null,
                'recommending_position' => $data['recommendingPosition'] ?? null,
                'certified_name' => $data['certifiedName'] ?? null,
                'certified_position' => $data['certifiedPosition'] ?? null,
                'approved_name' => $data['approvedName'] ?? null,
                'approved_position' => $data['approvedPosition'] ?? null,
                'status' => $data['status'],
                'history' => $data['history'] ?? [],
                'owner_id' => $document->owner_id ?? $user?->id,
                'owner_name' => $document->owner_name ?? $user?->name,
            ])->save();

            $document->rows()->delete();
            foreach ($data['rows'] as $index => $row) {
                $document->rows()->create([
                    'client_uid' => $row['id'],
                    'label' => $row['label'] ?? '',
                    'note' => $row['note'] ?? '',
                    'indent' => $row['indent'],
                    'header' => $row['header'],
                    'approved' => $row['approved'] ?? '',
                    'reprogrammings' => $row['reprogrammings'] ?? [],
                    'sort_order' => $index,
                ]);
            }

            return $document->fresh('rows');
        });

        $this->audit($request, 'LIB', 'Saved LIB Document', $document->client_uid);

        return response()->json(['data' => $this->formatLibDocument($document)], $clientUid ? 200 : 201);
    }

    public function planningLibDestroy(Request $request, string $clientUid): JsonResponse
    {
        $this->guardModule('lib');
        $document = LibDocument::where('client_uid', $clientUid)->firstOrFail();
        $this->abortUnlessOwned($document->owner_id);
        $document->delete();

        return response()->json(['message' => 'LIB document removed.']);
    }

    public function planningPpmpIndex(Request $request): JsonResponse
    {
        $this->guardModule('ppmp');

        $query = PpmpDocument::with('items')->whereNotNull('client_uid')->latest('created_at');
        $this->scopePpmpVisibility($query);

        if ($request->query('lib_id')) {
            $query->whereHas('libDocument', fn (Builder $q) => $q->where('client_uid', $request->query('lib_id')));
        }

        return response()->json(['data' => $query->get()->map(fn (PpmpDocument $document): array => $this->formatPlanningPpmp($document))->all()]);
    }

    public function planningPpmpShow(Request $request, string $clientUid): JsonResponse
    {
        $this->guardModule('ppmp');
        $document = PpmpDocument::with('items')->where('client_uid', $clientUid)->firstOrFail();
        $this->abortUnlessCanViewPpmp($document);

        return response()->json(['data' => $this->formatPlanningPpmp($document)]);
    }

    public function planningPpmpStore(Request $request, ?string $clientUid = null): JsonResponse
    {
        $this->guardModule('ppmp');

        $data = $request->validate([
            'id' => ['required', 'string'],
            'libId' => ['required', 'string'],
            'ppmpNo' => ['nullable', 'string'],
            'status' => ['required', 'string'],
            'revisionCount' => ['nullable', 'integer', 'min:0'],
            'fiscalYear' => ['required', 'integer', 'between:2000,2100'],
            'endUserUnit' => ['nullable', 'string'],
            'documentType' => ['required', 'string', Rule::in(['Indicative', 'Final'])],
            'preparedByName' => ['nullable', 'string'],
            'preparedByPosition' => ['nullable', 'string'],
            'preparedByDate' => ['nullable', 'string'],
            'budgetOfficerName' => ['nullable', 'string'],
            'budgetOfficerPosition' => ['nullable', 'string'],
            'budgetCertifiedDate' => ['nullable', 'string'],
            'rows' => ['required', 'array'],
            'rows.*.id' => ['required', 'string'],
            'rows.*.expense_category' => ['nullable', 'string'],
            'rows.*.expense_subcategory' => ['nullable', 'string'],
            'rows.*.general_description' => ['nullable', 'string'],
            'rows.*.item_name' => ['nullable', 'string'],
            'rows.*.project_type' => ['nullable', 'string'],
            'rows.*.quantity_size' => ['nullable', 'string'],
            'rows.*.quantity' => ['nullable', 'numeric'],
            'rows.*.recommended_mode' => ['nullable', 'string'],
            'rows.*.pre_procurement_conference' => ['nullable', 'string'],
            'rows.*.procurement_start' => ['nullable', 'string'],
            'rows.*.procurement_end' => ['nullable', 'string'],
            'rows.*.delivery_period' => ['nullable', 'string'],
            'rows.*.source_of_funds' => ['nullable', 'string'],
            'rows.*.estimated_budget' => ['nullable', 'numeric'],
            'rows.*.supporting_documents' => ['nullable', 'string'],
            'rows.*.remarks' => ['nullable', 'string'],
            'formRows' => ['nullable', 'array'],
            'totalBudget' => ['required', 'numeric', 'min:0'],
            'createdAt' => ['nullable', 'date'],
        ]);

        $user = $request->user();
        $uid = $clientUid ?? $data['id'];
        $lib = LibDocument::where('client_uid', $data['libId'])->first();
        $budgetOfficer = $this->designatedBudgetOfficer();

        [$document, $justSubmitted] = DB::transaction(function () use ($data, $uid, $user, $lib, $budgetOfficer): array {
            $document = PpmpDocument::firstOrNew(['client_uid' => $uid]);
            if ($document->exists) {
                $this->abortUnlessOwned($document->owner_id);
                // Once the Budget Officer certifies funds, the PPMP is final and locked.
                abort_if($document->status === 'Approved', 422, 'This PPMP has been approved by the Budget Officer and can no longer be revised.');
            }

            // Fire a notification only on the transition INTO "Submitted to Budget Officer".
            $justSubmitted = $data['status'] === 'Submitted to Budget Officer'
                && $document->status !== 'Submitted to Budget Officer';

            // The Budget Officer certifies fund availability, so their name/position is
            // server-authoritative — every PPMP is certified by the designated officer.
            $budgetOfficerName = $budgetOfficer?->name ?? ($data['budgetOfficerName'] ?? null);
            $budgetOfficerPosition = $budgetOfficer
                ? ($budgetOfficer->position ?: 'Budget Officer')
                : ($data['budgetOfficerPosition'] ?? null);

            $document->fill([
                'project_id' => $document->project_id ?? $this->defaultPlanningProjectId(),
                'lib_document_id' => $lib?->id,
                'ppmp_no' => $data['ppmpNo'] ?? null,
                'status' => $data['status'],
                'revision_count' => $data['revisionCount'] ?? 0,
                'fiscal_year' => $data['fiscalYear'],
                'end_user_unit' => $data['endUserUnit'] ?? null,
                'document_type' => $data['documentType'],
                'prepared_submitted_by_name' => $data['preparedByName'] ?? null,
                'prepared_submitted_by_position' => $data['preparedByPosition'] ?? null,
                'prepared_submitted_by_date' => $this->dateOrNull($data['preparedByDate'] ?? null),
                'budget_officer_id' => $budgetOfficer?->id ?? $document->budget_officer_id,
                'budget_officer_name' => $budgetOfficerName,
                'budget_officer_position' => $budgetOfficerPosition,
                'budget_certified_date' => $this->dateOrNull($data['budgetCertifiedDate'] ?? null),
                'total_estimated_budget' => $data['totalBudget'],
                'row_count' => count($data['rows']),
                'form_rows' => $data['formRows'] ?? [],
                'owner_id' => $document->owner_id ?? $user?->id,
                'owner_name' => $document->owner_name ?? $user?->name,
                'imported_by' => $document->imported_by ?? $user?->id,
                'imported_at' => $document->imported_at ?? now(),
                'submitted_at' => $justSubmitted ? now() : $document->submitted_at,
            ])->save();

            // Preserve any Budget Officer per-item comments across the delete/recreate.
            $existingComments = $document->items()->pluck('reviewer_comment', 'client_uid');

            $document->items()->delete();
            foreach ($data['rows'] as $index => $row) {
                $itemName = $row['item_name'] ?? $row['general_description'] ?? 'PPMP Item';
                $itemId = $this->resolveOrCreateProcurementItemId($itemName, [
                    'description' => $row['quantity_size'] ?? null,
                    'category' => $row['expense_category'] ?? null,
                    'uom' => 'unit',
                    'is_cse' => false,
                ]);
                $quantity = $this->quantityFromPpmpRow($row);
                $budget = (float) ($row['estimated_budget'] ?? 0);

                $document->items()->create([
                    'client_uid' => $row['id'],
                    'project_id' => $document->project_id,
                    'procurement_item_id' => $itemId,
                    'row_number' => $index + 1,
                    'expense_category' => $row['expense_category'] ?? null,
                    'expense_subcategory' => $row['expense_subcategory'] ?? null,
                    'general_description' => $row['general_description'] ?? null,
                    'project_type' => $row['project_type'] ?? null,
                    'item_name' => $itemName,
                    'quantity_size' => $row['quantity_size'] ?? null,
                    'quantity' => $quantity,
                    'recommended_mode' => $row['recommended_mode'] ?? null,
                    'pre_procurement_conference' => $row['pre_procurement_conference'] ?? null,
                    'procurement_start' => $row['procurement_start'] ?? null,
                    'procurement_end' => $row['procurement_end'] ?? null,
                    'delivery_period' => $row['delivery_period'] ?? null,
                    'source_of_funds' => $row['source_of_funds'] ?? null,
                    'estimated_budget' => $budget,
                    'estimated_unit_cost' => $quantity > 0 ? $budget / $quantity : $budget,
                    'supporting_documents' => $row['supporting_documents'] ?? null,
                    'remarks' => $row['remarks'] ?? null,
                    'reviewer_comment' => $existingComments[$row['id']] ?? null,
                    'schedule' => $this->scheduleFromPpmpRow($row),
                ]);
            }

            return [$document->fresh('items'), $justSubmitted];
        });

        if ($justSubmitted && $document->budget_officer_id) {
            $this->notify(
                $document->budgetOfficer,
                'ppmp_submitted',
                "PPMP {$document->ppmp_no} submitted for fund certification",
                ($document->owner_name ?: 'A requester').' submitted a PPMP for your review.',
                $this->ppmpLink($document),
                ['ppmpId' => $document->client_uid, 'libId' => $document->libDocument?->client_uid],
            );
        }

        $this->audit($request, 'PPMP', 'Saved PPMP Document', $document->client_uid);

        return response()->json(['data' => $this->formatPlanningPpmp($document)], $clientUid ? 200 : 201);
    }

    public function planningPpmpReturn(Request $request, string $clientUid): JsonResponse
    {
        return $this->reviewPlanningPpmp($request, $clientUid, 'return');
    }

    public function planningPpmpApprove(Request $request, string $clientUid): JsonResponse
    {
        return $this->reviewPlanningPpmp($request, $clientUid, 'approve');
    }

    /**
     * Budget Officer review action (return or approve). Only the designated
     * Budget Officer (or a superadmin) may act, and they act across ownership.
     */
    private function reviewPlanningPpmp(Request $request, string $clientUid, string $action): JsonResponse
    {
        $this->guardModule('ppmp');

        $data = $request->validate([
            'reviewComment' => ['nullable', 'string'],
            'returnReason' => ['nullable', 'string'],
            'itemComments' => ['nullable', 'array'],
            'itemComments.*' => ['nullable', 'string'],
        ]);

        $document = PpmpDocument::with('items')->where('client_uid', $clientUid)->firstOrFail();
        $user = $request->user();

        abort_unless(
            $user?->tier === 'superadmin' || $this->isDesignatedBudgetOfficer($user, $document),
            403,
            'Only the designated Budget Officer can review this PPMP.',
        );

        if ($action === 'return') {
            abort_if(trim((string) ($data['returnReason'] ?? '')) === '', 422, 'A reason is required when returning a PPMP.');
        }

        $document = DB::transaction(function () use ($document, $data, $user, $action): PpmpDocument {
            foreach (($data['itemComments'] ?? []) as $itemUid => $comment) {
                $document->items()->where('client_uid', $itemUid)->update(['reviewer_comment' => $comment ?: null]);
            }

            if ($action === 'approve') {
                $document->fill([
                    'status' => 'Approved',
                    'budget_officer_comment' => $data['reviewComment'] ?? $document->budget_officer_comment,
                    'return_reason' => null,
                    'reviewed_at' => now(),
                    // The certification date shown on the PPMP is the day the officer approved.
                    'budget_certified_date' => now()->toDateString(),
                    'approved_by_id' => $user?->id,
                    'approved_by_name' => $user?->name,
                    'approved_at' => now(),
                    // PNPKI digital signature to be wired in later; record a placeholder now.
                    'approval_signature' => 'Certified electronically by '.($user?->name ?? 'Budget Officer').' on '.now()->toDayDateTimeString(),
                ]);
            } else {
                $document->fill([
                    'status' => 'Returned',
                    'budget_officer_comment' => $data['reviewComment'] ?? $document->budget_officer_comment,
                    'return_reason' => $data['returnReason'] ?? null,
                    'reviewed_at' => now(),
                    'revision_count' => (int) $document->revision_count + 1,
                ]);
            }

            $document->save();

            return $document->fresh('items');
        });

        if ($document->owner_id) {
            $isApprove = $action === 'approve';
            $this->notify(
                $document->owner,
                $isApprove ? 'ppmp_approved' : 'ppmp_returned',
                $isApprove
                    ? "PPMP {$document->ppmp_no} approved"
                    : "PPMP {$document->ppmp_no} returned for revision",
                $isApprove
                    ? ($document->budget_officer_name ?: 'The Budget Officer').' certified fund availability. You can now create a Purchase Request against it.'
                    : ($document->return_reason ?: 'Please review the Budget Officer\'s comments and resubmit.'),
                $this->ppmpLink($document),
                ['ppmpId' => $document->client_uid, 'libId' => $document->libDocument?->client_uid],
            );
        }

        $this->audit($request, 'PPMP', $action === 'approve' ? 'Approved PPMP (Budget Officer)' : 'Returned PPMP (Budget Officer)', $document->client_uid);

        return response()->json(['data' => $this->formatPlanningPpmp($document)]);
    }

    public function planningPpmpDestroy(Request $request, string $clientUid): JsonResponse
    {
        $this->guardModule('ppmp');
        $document = PpmpDocument::where('client_uid', $clientUid)->firstOrFail();
        $this->abortUnlessOwned($document->owner_id);
        $document->delete();

        return response()->json(['message' => 'PPMP document removed.']);
    }

    public function store(Request $request): JsonResponse
    {
        $resource = $this->resource($request);
        $this->guardResource($resource);

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
        $resource = $this->resource($request);
        $this->guardResource($resource);
        $record = $this->query($resource)->findOrFail($resourceId);

        return response()->json(['data' => $this->format($record)]);
    }

    public function update(Request $request, int $resourceId): JsonResponse
    {
        $resource = $this->resource($request);
        $this->guardResource($resource);

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
        $resource = $this->resource($request);
        $this->guardResource($resource);
        $record = $this->query($resource)->findOrFail($resourceId);

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
        $this->guardModule('references');
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
        $this->guardModule('references');
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
        $this->guardModule('references');
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
        if (preg_match('/(?:quantity|qty)\s*:\s*([0-9,]+(?:\.[0-9]+)?)/i', $quantitySize, $matches)) {
            return max(0.01, (float) str_replace(',', '', $matches[1]));
        }

        return 1.0;
    }

    private function scopeOwned(Builder $query): void
    {
        $user = request()->user();
        if ($user?->tier === 'superadmin') {
            return;
        }

        $query->where('owner_id', $user?->id);
    }

    private function abortUnlessOwned(?int $ownerId): void
    {
        $user = request()->user();
        if ($user?->tier === 'superadmin') {
            return;
        }

        abort_unless($ownerId !== null && $ownerId === $user?->id, 403, 'You do not have access to this document.');
    }

    /**
     * PPMP visibility: owners see their own; the designated Budget Officer also
     * sees PPMPs routed to them for review; superadmins see everything.
     */
    private function scopePpmpVisibility(Builder $query): void
    {
        $user = request()->user();
        if ($user?->tier === 'superadmin') {
            return;
        }

        $officer = $this->designatedBudgetOfficer();
        $query->where(function (Builder $q) use ($user, $officer): void {
            $q->where('owner_id', $user?->id);
            if ($officer && $officer->id === $user?->id) {
                $q->orWhere('budget_officer_id', $user->id);
            }
        });
    }

    private function abortUnlessCanViewPpmp(PpmpDocument $document): void
    {
        $user = request()->user();
        if ($user?->tier === 'superadmin') {
            return;
        }

        $isOwner = $document->owner_id !== null && $document->owner_id === $user?->id;
        abort_unless($isOwner || $this->isDesignatedBudgetOfficer($user, $document), 403, 'You do not have access to this document.');
    }

    /**
     * LIB visibility mirrors PPMP: owners and superadmins as usual, plus the
     * designated Budget Officer for any LIB referenced by a PPMP routed to them
     * (so they can open the source budget while reviewing).
     */
    private function scopeLibVisibility(Builder $query): void
    {
        $user = request()->user();
        if ($user?->tier === 'superadmin') {
            return;
        }

        $officerLibIds = $this->budgetOfficerLibIds($user);
        $query->where(function (Builder $q) use ($user, $officerLibIds): void {
            $q->where('owner_id', $user?->id);
            if ($officerLibIds !== []) {
                $q->orWhereIn('id', $officerLibIds);
            }
        });
    }

    /** LIB ids referenced by PPMPs routed to $user as Budget Officer. */
    private function budgetOfficerLibIds(?User $user): array
    {
        if ($user === null || $this->designatedBudgetOfficer()?->id !== $user->id) {
            return [];
        }

        return PpmpDocument::where('budget_officer_id', $user->id)
            ->whereNotNull('lib_document_id')
            ->pluck('lib_document_id')
            ->unique()
            ->values()
            ->all();
    }

    /** The user currently designated as Budget Officer, or null if none is set. */
    private function designatedBudgetOfficer(): ?User
    {
        $id = $this->preferenceValue('budget_officer_user_id', null);

        return $id ? User::find((int) $id) : null;
    }

    /**
     * Whether $user is the Budget Officer for $document — either the officer the
     * document was routed to, or the current global designated officer.
     */
    private function isDesignatedBudgetOfficer(?User $user, ?PpmpDocument $document = null): bool
    {
        if ($user === null) {
            return false;
        }

        if ($document?->budget_officer_id !== null && $document?->budget_officer_id === $user->id) {
            return true;
        }

        return $this->designatedBudgetOfficer()?->id === $user->id;
    }

    private function ppmpLink(PpmpDocument $document): string
    {
        $lib = $document->libDocument?->client_uid;

        return $lib
            ? "/planning/ppmp/new?lib={$lib}&edit={$document->client_uid}"
            : '/planning/ppmp';
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

    private function defaultPlanningProjectId(): int
    {
        return Project::firstOrCreate(
            ['code' => 'LOCAL-PLANNING'],
            [
                'title' => 'Local Planning Documents',
                'description' => 'System project used for LIB/PPMP planning documents created from the planning module.',
                'fiscal_year' => (int) now()->format('Y'),
                'status' => 'Active',
            ],
        )->id;
    }

    private function dateOrNull(?string $value): ?string
    {
        $value = trim((string) $value);
        return $value === '' ? null : $value;
    }

    private function formatLibDocument(LibDocument $document): array
    {
        $document->loadMissing('rows');

        return [
            'id' => $document->client_uid,
            'fiscalYear' => $document->fiscal_year,
            'programTitle' => $document->program_title ?? '',
            'projectTitle' => $document->project_title ?? '',
            'implementingAgency' => $document->implementing_agency ?? '',
            'totalDuration' => $document->total_duration ?? '',
            'cooperatingAgency' => $document->cooperating_agency ?? '',
            'projectLeader' => $document->project_leader ?? '',
            'monitoringAgency' => $document->monitoring_agency ?? '',
            'rows' => $document->rows->map(fn (LibDocumentRow $row): array => [
                'id' => $row->client_uid,
                'label' => $row->label ?? '',
                'note' => $row->note ?? '',
                'indent' => $row->indent,
                'header' => $row->header,
                'approved' => $row->approved ?? '',
                'reprogrammings' => $row->reprogrammings ?? [],
            ])->all(),
            'revision' => $document->revision,
            'chargeableNote' => $document->chargeable_note ?? '',
            'preparedByName' => $document->prepared_by_name ?? '',
            'preparedByPosition' => $document->prepared_by_position ?? '',
            'recommendingName' => $document->recommending_name ?? '',
            'recommendingPosition' => $document->recommending_position ?? '',
            'certifiedName' => $document->certified_name ?? '',
            'certifiedPosition' => $document->certified_position ?? '',
            'approvedName' => $document->approved_name ?? '',
            'approvedPosition' => $document->approved_position ?? '',
            'status' => $document->status,
            'history' => $document->history ?? [],
            'ownerId' => $document->owner_id,
            'ownerName' => $document->owner_name,
            'createdAt' => $document->created_at?->toISOString(),
            'updatedAt' => $document->updated_at?->toISOString(),
        ];
    }

    private function formatPlanningPpmp(PpmpDocument $document): array
    {
        $document->loadMissing(['items', 'libDocument']);

        return [
            'id' => $document->client_uid,
            'libId' => $document->libDocument?->client_uid,
            'ppmpNo' => $document->ppmp_no ?? '',
            'status' => $document->status,
            'revisionCount' => $document->revision_count,
            'fiscalYear' => $document->fiscal_year,
            'endUserUnit' => $document->end_user_unit ?? '',
            'documentType' => $document->document_type,
            'preparedByName' => $document->prepared_submitted_by_name ?? '',
            'preparedByPosition' => $document->prepared_submitted_by_position ?? '',
            'preparedByDate' => $document->prepared_submitted_by_date?->toDateString() ?? '',
            'budgetOfficerName' => $document->budget_officer_name ?? '',
            'budgetOfficerPosition' => $document->budget_officer_position ?? '',
            'budgetCertifiedDate' => $document->budget_certified_date?->toDateString() ?? '',
            'rows' => $document->items
                ->sortBy([['row_number', 'asc'], ['id', 'asc']])
                ->values()
                ->map(fn (PpmpItem $item): array => [
                    'id' => $item->client_uid ?? (string) $item->id,
                    'expense_category' => $item->expense_category ?? '',
                    'expense_subcategory' => $item->expense_subcategory ?? '',
                    'general_description' => $item->general_description ?? '',
                    'item_name' => $item->item_name ?? $item->item?->name ?? '',
                    'project_type' => $item->project_type ?? '',
                    'quantity_size' => $item->quantity_size ?? '',
                    'quantity' => (float) $item->quantity,
                    'recommended_mode' => $item->recommended_mode ?? '',
                    'pre_procurement_conference' => $item->pre_procurement_conference ?? '',
                    'procurement_start' => $item->procurement_start ?? '',
                    'procurement_end' => $item->procurement_end ?? '',
                    'delivery_period' => $item->delivery_period ?? '',
                    'source_of_funds' => $item->source_of_funds ?? '',
                    'estimated_budget' => (float) ($item->estimated_budget ?? 0),
                    'supporting_documents' => $item->supporting_documents ?? '',
                    'remarks' => $item->remarks ?? '',
                    'reviewer_comment' => $item->reviewer_comment ?? '',
                ])->all(),
            'formRows' => $document->form_rows ?? [],
            'totalBudget' => (float) $document->total_estimated_budget,
            'ownerId' => $document->owner_id,
            'ownerName' => $document->owner_name,
            'budgetOfficerId' => $document->budget_officer_id,
            'reviewComment' => $document->budget_officer_comment ?? '',
            'returnReason' => $document->return_reason ?? '',
            'submittedAt' => $document->submitted_at?->toISOString(),
            'reviewedAt' => $document->reviewed_at?->toISOString(),
            'approvedByName' => $document->approved_by_name ?? '',
            'approvedAt' => $document->approved_at?->toISOString(),
            'approvalSignature' => $document->approval_signature ?? '',
            'createdAt' => $document->created_at?->toISOString(),
        ];
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
        $this->guardModule('references');
        $query = AppCseItem::with('item');
        $project ? $query->whereBelongsTo($project) : $query->whereNull('project_id');

        return response()->json(['data' => $query->get()]);
    }

    public function appCseStore(Request $request, ?Project $project = null): JsonResponse
    {
        $this->guardModule('references');
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
        $this->guardModule('references');
        $query = AppNonCseItem::with('item');
        $project ? $query->whereBelongsTo($project) : $query->whereNull('project_id');

        return response()->json(['data' => $query->get()]);
    }

    public function appNonCseStore(Request $request, ?Project $project = null): JsonResponse
    {
        $this->guardModule('references');
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
        $this->guardModule('references');
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
        $this->guardModule('references');
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
        $this->guardModule('validation');
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
        $this->guardModule('pr');
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
        $this->guardModule('approvals');
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
        $this->guardModule('approvals');
        $purchaseRequest->forceFill([
            'status' => 'For Approval',
            'stage' => $this->preferenceValue('rd_approval_stage', 'Director Approval'),
        ])->save();
        $this->recordAction($request, $purchaseRequest, 'Recommender', 'Recommended', $request->input('remarks'));

        return response()->json(['message' => 'Purchase Request recommended.', 'data' => $this->format($purchaseRequest->fresh())]);
    }

    public function approve(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $this->guardModule('approvals');
        $purchaseRequest->forceFill(['status' => 'Approved', 'stage' => 'Approved'])->save();
        $this->recordAction($request, $purchaseRequest, 'Approver', 'Approved', $request->input('remarks'));

        return response()->json(['message' => 'Purchase Request approved.', 'data' => $this->format($purchaseRequest->fresh())]);
    }

    public function reject(Request $request, PurchaseRequest $purchaseRequest): JsonResponse
    {
        $this->guardModule('approvals');
        $data = $request->validate(['reason' => ['required', 'string']]);
        $purchaseRequest->forceFill(['status' => 'Rejected', 'stage' => 'Rejected'])->save();
        $this->recordAction($request, $purchaseRequest, 'Approver', 'Rejected', $data['reason']);

        return response()->json(['message' => 'Purchase Request rejected.', 'data' => $this->format($purchaseRequest->fresh())]);
    }

    public function auditLogs(Request $request): JsonResponse
    {
        $this->guardModule('audit');
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
        $this->guardModule('settings');
        $this->ensureDefaultSystemPreferences();

        return response()->json([
            'data' => SystemPreference::orderBy('category')->orderBy('id')->get(),
        ]);
    }

    public function updateSystemSettings(Request $request): JsonResponse
    {
        $this->guardModule('settings');
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
        $name = trim((string) ($value ?? ''));

        if ($name === '') {
            return null;
        }

        $needle = mb_strtolower($name);

        $existing = FundSource::whereRaw('LOWER(name) = ?', [$needle])
            ->orWhereRaw('LOWER(fund_type) = ?', [$needle])
            ->value('id');

        if ($existing !== null) {
            return $existing;
        }

        // "Charged to" labels reference a PPMP (e.g. "PPMP 4 — Project title")
        // rather than a seeded fund source. Register the label so the PR saves
        // and the exact label round-trips back — the client uses it to re-link
        // the PR to its charged PPMP.
        return FundSource::create([
            'name' => $name,
            'fund_type' => 'GAA',
            'description' => 'Auto-created from PR "Charged to"',
        ])->id;
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
            'tier' => ['sometimes', Rule::in(['superadmin', 'admin', 'regular'])],
            'modules' => ['sometimes', 'nullable', 'array'],
            'modules.*' => ['string', Rule::in(User::TOGGLEABLE_MODULES)],
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
            'users' => $request->validate(['name' => ['sometimes', 'string'], 'email' => ['sometimes', 'email'], 'office_id' => ['nullable', 'exists:offices,id'], 'role_ids' => ['array'], 'role_ids.*' => ['exists:roles,id'], 'status' => ['sometimes', 'string'], 'tier' => ['sometimes', Rule::in(['superadmin', 'admin', 'regular'])], 'modules' => ['sometimes', 'nullable', 'array'], 'modules.*' => ['string', Rule::in(User::TOGGLEABLE_MODULES)]]),
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
                'key' => 'budget_officer_user_id',
                'value' => ['value' => optional(User::where('status', 'Active')->where('name', 'like', '%Marites%')->first())->id],
                'category' => 'Workflow',
                'label' => 'Budget Officer',
                'description' => 'Account that certifies fund availability on PPMPs. Submissions are routed here for review, return, or approval.',
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
        ];
    }

    private function nextPrNo(): string
    {
        $year = now()->year;
        $count = PurchaseRequest::whereYear('created_at', $year)->count() + 1;

        return sprintf('PR-%d-%04d', $year, $count);
    }
}
