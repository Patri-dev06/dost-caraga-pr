<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LibEntry;
use App\Models\LibLineItem;
use App\Models\PpmpItem;
use App\Services\ApprovalEngineService;
use App\Services\BudgetEnforcementService;
use App\Services\DocumentAmendmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LibController extends Controller
{
    public function __construct(
        private ApprovalEngineService $approvalEngine,
        private BudgetEnforcementService $budgetService,
        private DocumentAmendmentService $amendmentService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = LibEntry::with(['project', 'fundSource', 'creator'])
            ->when($request->query('project_id'), fn ($q, $v) => $q->where('project_id', $v))
            ->when($request->query('budget_year'), fn ($q, $v) => $q->where('budget_year', $v))
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('fund_source_id'), fn ($q, $v) => $q->where('fund_source_id', $v))
            ->whereNull('parent_id')
            ->orWhereIn('id', function ($q) {
                $q->selectRaw('MAX(id)')->from('lib_entries')->whereNotNull('parent_id')->groupBy('parent_id');
            })
            ->latest('id');

        $data = $query->paginate((int) $request->query('per_page', 15));
        $data->through(fn (LibEntry $entry) => $this->format($entry));

        return response()->json($data);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'project_id' => ['required', 'exists:projects,id'],
            'fund_source_id' => ['required', 'exists:fund_sources,id'],
            'budget_year' => ['required', 'integer', 'between:2000,2100'],
            'pap_code' => ['nullable', 'string', 'max:50'],
            'program_title' => ['nullable', 'string', 'max:255'],
            'implementing_agency' => ['nullable', 'string', 'max:255'],
            'total_duration' => ['nullable', 'string', 'max:255'],
            'cooperating_agency' => ['nullable', 'string'],
            'project_leader' => ['nullable', 'string', 'max:255'],
            'monitoring_agency' => ['nullable', 'string', 'max:255'],
            'object_of_expenditure' => ['required', 'string', 'max:255'],
            'account_code' => ['required', 'string', 'max:50'],
            'allocated_amount' => ['required', 'numeric', 'min:0.01'],
            'line_items' => ['nullable', 'array'],
            'line_items.*.main_category' => ['required', 'string', 'max:100'],
            'line_items.*.sub_category' => ['required', 'string', 'max:150'],
            'line_items.*.specific_item' => ['nullable', 'string', 'max:150'],
            'line_items.*.custom_item_name' => ['nullable', 'string', 'max:255'],
            'line_items.*.approved_lib_amount' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.jan' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.feb' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.mar' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.apr' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.may' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.jun' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.jul' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.aug' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.sep' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.oct' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.nov' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.dec_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        $lineItems = $data['line_items'] ?? [];
        unset($data['line_items']);

        $data['available_amount'] = $data['allocated_amount'];
        $data['created_by'] = $request->user()->id;

        $entry = DB::transaction(function () use ($data, $lineItems) {
            $entry = LibEntry::create($data);

            foreach ($lineItems as $index => $item) {
                $months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec_amount'];
                $total = collect($months)->sum(fn ($m) => (float) ($item[$m] ?? 0));
                $item['total'] = $total;
                $item['sort_order'] = $index;
                $entry->lineItems()->create($item);
            }

            return $entry;
        });

        $this->audit($request, 'Created LIB Entry', $entry->account_code);

        return response()->json(['data' => $this->format($entry->fresh(['project', 'fundSource', 'creator', 'lineItems']))], 201);
    }

    public function show(LibEntry $lib): JsonResponse
    {
        $lib->loadMissing(['project', 'fundSource', 'creator', 'approvalSteps.workflowStage', 'amendments', 'lineItems']);

        $ppmpItems = PpmpItem::with(['document', 'item'])
            ->where('lib_entry_id', $lib->id)
            ->get();

        return response()->json([
            'data' => $this->format($lib),
            'line_items' => $lib->lineItems->map(fn (LibLineItem $item) => $this->formatLineItem($item)),
            'ppmp_items' => $ppmpItems,
            'approval_trail' => $this->approvalEngine->getApprovalTrail($lib),
        ]);
    }

    public function update(Request $request, LibEntry $lib): JsonResponse
    {
        if ($lib->isLocked()) {
            return response()->json(['message' => 'This LIB entry is locked and cannot be edited.'], 422);
        }

        $data = $request->validate([
            'project_id' => ['sometimes', 'exists:projects,id'],
            'fund_source_id' => ['sometimes', 'exists:fund_sources,id'],
            'budget_year' => ['sometimes', 'integer', 'between:2000,2100'],
            'pap_code' => ['nullable', 'string', 'max:50'],
            'program_title' => ['nullable', 'string', 'max:255'],
            'implementing_agency' => ['nullable', 'string', 'max:255'],
            'total_duration' => ['nullable', 'string', 'max:255'],
            'cooperating_agency' => ['nullable', 'string'],
            'project_leader' => ['nullable', 'string', 'max:255'],
            'monitoring_agency' => ['nullable', 'string', 'max:255'],
            'object_of_expenditure' => ['sometimes', 'string', 'max:255'],
            'account_code' => ['sometimes', 'string', 'max:50'],
            'allocated_amount' => ['sometimes', 'numeric', 'min:0.01'],
            'line_items' => ['nullable', 'array'],
            'line_items.*.main_category' => ['required', 'string', 'max:100'],
            'line_items.*.sub_category' => ['required', 'string', 'max:150'],
            'line_items.*.specific_item' => ['nullable', 'string', 'max:150'],
            'line_items.*.custom_item_name' => ['nullable', 'string', 'max:255'],
            'line_items.*.approved_lib_amount' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.jan' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.feb' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.mar' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.apr' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.may' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.jun' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.jul' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.aug' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.sep' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.oct' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.nov' => ['nullable', 'numeric', 'min:0'],
            'line_items.*.dec_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        $lineItems = $data['line_items'] ?? null;
        unset($data['line_items']);

        if (isset($data['allocated_amount'])) {
            $committed = PpmpItem::where('lib_entry_id', $lib->id)
                ->whereHas('document', fn ($q) => $q->whereIn('status', ['Approved', 'Submitted']))
                ->sum('estimated_budget');

            if ($data['allocated_amount'] < $committed) {
                return response()->json([
                    'message' => 'Allocated amount cannot be less than committed PPMP total.',
                    'committed' => (float) $committed,
                ], 422);
            }

            $data['available_amount'] = $data['allocated_amount'] - (float) $committed;
        }

        DB::transaction(function () use ($lib, $data, $lineItems) {
            $lib->fill($data)->save();

            if ($lineItems !== null) {
                $lib->lineItems()->delete();
                $months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec_amount'];
                foreach ($lineItems as $index => $item) {
                    $total = collect($months)->sum(fn ($m) => (float) ($item[$m] ?? 0));
                    $item['total'] = $total;
                    $item['sort_order'] = $index;
                    $lib->lineItems()->create($item);
                }
            }
        });

        $this->audit($request, 'Updated LIB Entry', $lib->account_code);

        return response()->json(['data' => $this->format($lib->fresh(['project', 'fundSource', 'creator']))]);
    }

    public function balance(LibEntry $lib): JsonResponse
    {
        $available = $this->budgetService->libAvailableAmount($lib);

        return response()->json([
            'allocated' => (float) $lib->allocated_amount,
            'committed' => (float) $lib->allocated_amount - $available,
            'available' => $available,
        ]);
    }

    public function submit(Request $request, LibEntry $lib): JsonResponse
    {
        $step = $this->approvalEngine->submit($lib, $request->user());
        $this->audit($request, 'Submitted LIB for Approval', $lib->account_code);

        return response()->json([
            'message' => 'LIB entry submitted for approval.',
            'data' => $this->format($lib->fresh(['project', 'fundSource', 'creator'])),
        ]);
    }

    public function approve(Request $request, LibEntry $lib): JsonResponse
    {
        $step = $this->approvalEngine->approve($lib, $request->user(), $request->input('remarks'));
        $this->audit($request, 'Approved LIB Entry', $lib->account_code);

        return response()->json([
            'message' => 'LIB entry approved.',
            'data' => $this->format($lib->fresh(['project', 'fundSource', 'creator'])),
        ]);
    }

    public function returnDocument(Request $request, LibEntry $lib): JsonResponse
    {
        $request->validate(['remarks' => ['required', 'string']]);

        $step = $this->approvalEngine->returnDocument($lib, $request->user(), $request->input('remarks'));
        $this->audit($request, 'Returned LIB Entry', $lib->account_code);

        return response()->json([
            'message' => 'LIB entry returned for revision.',
            'data' => $this->format($lib->fresh(['project', 'fundSource', 'creator'])),
        ]);
    }

    public function reject(Request $request, LibEntry $lib): JsonResponse
    {
        $request->validate(['remarks' => ['required', 'string']]);

        $step = $this->approvalEngine->reject($lib, $request->user(), $request->input('remarks'));
        $this->audit($request, 'Rejected LIB Entry', $lib->account_code);

        return response()->json([
            'message' => 'LIB entry rejected.',
            'data' => $this->format($lib->fresh(['project', 'fundSource', 'creator'])),
        ]);
    }

    public function amend(Request $request, LibEntry $lib): JsonResponse
    {
        $newEntry = $this->amendmentService->amend($lib);
        $this->audit($request, 'Amended LIB Entry', $lib->account_code . ' -> v' . $newEntry->version);

        return response()->json([
            'message' => 'Amendment created as a new draft.',
            'data' => $this->format($newEntry->fresh(['project', 'fundSource', 'creator'])),
        ], 201);
    }

    public function cancel(Request $request, LibEntry $lib): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string']]);

        $this->amendmentService->cancel($lib, $request->input('reason'));
        $this->audit($request, 'Cancelled LIB Entry', $lib->account_code);

        return response()->json([
            'message' => 'LIB entry cancelled.',
            'data' => $this->format($lib->fresh(['project', 'fundSource', 'creator'])),
        ]);
    }

    public function export(LibEntry $lib): JsonResponse
    {
        $lib->loadMissing(['project', 'fundSource', 'creator', 'lineItems']);

        $lineItems = $lib->lineItems->map(fn (LibLineItem $item) => $this->formatLineItem($item));

        $mooeItems = $lineItems->filter(fn ($item) => $item['main_category'] === 'Maintenance and Other Operating Expenses');
        $capitalItems = $lineItems->filter(fn ($item) => $item['main_category'] === 'Capital Outlay');

        $mooeSubtotal = $mooeItems->sum('total');
        $capitalSubtotal = $capitalItems->sum('total');
        $grandTotal = $mooeSubtotal + $capitalSubtotal;

        return response()->json([
            'data' => $this->format($lib),
            'line_items' => $lineItems->values(),
            'summary' => [
                'mooe_subtotal' => $mooeSubtotal,
                'capital_subtotal' => $capitalSubtotal,
                'grand_total' => $grandTotal,
                'approved_lib_total' => (float) $lib->allocated_amount,
            ],
        ]);
    }

    private function format(LibEntry $entry): array
    {
        return [
            'id' => $entry->id,
            'project_id' => $entry->project_id,
            'project_title' => $entry->project?->title,
            'fund_source_id' => $entry->fund_source_id,
            'fund_source_name' => $entry->fundSource?->name,
            'budget_year' => $entry->budget_year,
            'pap_code' => $entry->pap_code,
            'program_title' => $entry->program_title,
            'implementing_agency' => $entry->implementing_agency,
            'total_duration' => $entry->total_duration,
            'cooperating_agency' => $entry->cooperating_agency,
            'project_leader' => $entry->project_leader,
            'monitoring_agency' => $entry->monitoring_agency,
            'object_of_expenditure' => $entry->object_of_expenditure,
            'account_code' => $entry->account_code,
            'allocated_amount' => (float) $entry->allocated_amount,
            'available_amount' => (float) $entry->available_amount,
            'status' => $entry->status,
            'version' => $entry->version,
            'parent_id' => $entry->parent_id,
            'created_by' => $entry->creator?->name,
            'approved_at' => $entry->approved_at?->toISOString(),
            'cancelled_at' => $entry->cancelled_at?->toISOString(),
            'cancellation_reason' => $entry->cancellation_reason,
            'created_at' => $entry->created_at?->toISOString(),
        ];
    }

    private function formatLineItem(LibLineItem $item): array
    {
        return [
            'id' => $item->id,
            'lib_entry_id' => $item->lib_entry_id,
            'main_category' => $item->main_category,
            'sub_category' => $item->sub_category,
            'specific_item' => $item->specific_item,
            'custom_item_name' => $item->custom_item_name,
            'approved_lib_amount' => (float) $item->approved_lib_amount,
            'jan' => (float) $item->jan,
            'feb' => (float) $item->feb,
            'mar' => (float) $item->mar,
            'apr' => (float) $item->apr,
            'may' => (float) $item->may,
            'jun' => (float) $item->jun,
            'jul' => (float) $item->jul,
            'aug' => (float) $item->aug,
            'sep' => (float) $item->sep,
            'oct' => (float) $item->oct,
            'nov' => (float) $item->nov,
            'dec_amount' => (float) $item->dec_amount,
            'total' => (float) $item->total,
            'sort_order' => $item->sort_order,
        ];
    }

    private function audit(Request $request, string $action, mixed $target = null): void
    {
        $user = $request->user();

        AuditLog::create([
            'actor_id' => $user?->id,
            'actor_name' => $user?->name,
            'role' => $user?->roles->pluck('name')->implode(', '),
            'module' => 'LIB',
            'action' => $action,
            'target' => $target === null ? null : (string) $target,
            'ip_address' => $request->ip(),
            'created_at' => now(),
        ]);
    }
}
