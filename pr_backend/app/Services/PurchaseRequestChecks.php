<?php

namespace App\Services;

use App\Models\AppCseItem;
use App\Models\AppNonCseItem;
use App\Models\BudgetAllocation;
use App\Models\PpmpItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * The flowchart's Module 1 pre-checks, run when a PR is validated or submitted:
 *
 *   Regular fund? ── Yes ──> Items in APP-CSE? ── No ──> Items in APP-Non-CSE? ── No ──> error
 *        │                          └ Yes ─────────────────────┴ Yes ──> Proceed to Create PR
 *        └ No ──> Identify Project ──> Items in PPMP? ──> Items within Budget (LIB)? ──> Items in APP-Non-CSE?
 *
 * Each check returns ['purchase_request_item_id', 'label', 'status', 'message']. A row with no item id
 * applies to the whole PR. Once a check fails, the later checks for that item are recorded as N/A.
 */
class PurchaseRequestChecks
{
    public const ERROR_NOT_IN_APP = 'Items is not in APP-Non-CSE & APP-CSE';

    public const ERROR_NOT_IN_PPMP = 'Item not in PPMP';

    public const ERROR_NOT_WITHIN_BUDGET = 'Item not within budget (LIB)';

    /** @param  array<int, string>  $regularFundTypes  lower-cased fund types that count as a regular fund */
    public function __construct(private array $regularFundTypes) {}

    /** Lower-cases a comma-separated preference value into the list the constructor takes. */
    public static function parseFundTypes(?string $value): array
    {
        return collect(explode(',', (string) $value))
            ->map(fn (string $type): string => mb_strtolower(trim($type)))
            ->filter()
            ->values()
            ->all();
    }

    /** Flowchart: "Regular fund?" — the charged PPMP's class wins; otherwise the fund source's type. */
    public function isRegularFund(PurchaseRequest $pr): bool
    {
        if ($pr->ppmpDocument) {
            return $pr->ppmpDocument->ppmp_class === 'Regular';
        }

        return in_array(mb_strtolower((string) $pr->fundSource?->fund_type), $this->regularFundTypes, true);
    }

    /** @return array<int, array{purchase_request_item_id: int|null, label: string, status: string, message: string}> */
    public function run(PurchaseRequest $pr): array
    {
        $pr->loadMissing('items', 'fundSource', 'project', 'ppmpDocument.libDocument');

        return $this->isRegularFund($pr) ? $this->regularPath($pr) : $this->nonRegularPath($pr);
    }

    /** Regular fund: APP-CSE, then APP-Non-CSE. No PPMP or LIB check on this path. */
    private function regularPath(PurchaseRequest $pr): array
    {
        $fundLabel = $pr->ppmpDocument ? 'Charged to a Regular PPMP' : 'Fund type '.($pr->fundSource?->fund_type ?? '—');
        $results = [$this->row(null, 'Regular Fund', 'Passed', "{$fundLabel}: regular fund. Items are checked against APP-CSE, then APP-Non-CSE.")];

        foreach ($pr->items as $item) {
            if ($this->inApp($item, cse: true)) {
                $results[] = $this->row($item, 'APP-CSE', 'Passed', 'Item is in APP-CSE.');
                $results[] = $this->row($item, 'APP-Non-CSE', 'N/A', 'Not checked; the item is in APP-CSE.');

                continue;
            }

            $results[] = $this->row($item, 'APP-CSE', 'N/A', 'Item is not in APP-CSE.');
            $results[] = $this->inApp($item, cse: false)
                ? $this->row($item, 'APP-Non-CSE', 'Passed', 'Item is in APP-Non-CSE.')
                : $this->row($item, 'APP-Non-CSE', 'Failed', self::ERROR_NOT_IN_APP.'.');
        }

        return $results;
    }

    /** Non-regular fund: Identify Project, then per item PPMP → Budget (LIB) → APP-Non-CSE. */
    private function nonRegularPath(PurchaseRequest $pr): array
    {
        $project = $this->projectName($pr);
        $results = [$this->row(null, 'Regular Fund', 'Passed', 'Non-regular fund: the project, PPMP, budget (LIB) and APP-Non-CSE are checked.')];

        if ($project === null) {
            $results[] = $this->row(null, 'Project', 'Failed', 'Identify the project: a non-regular fund PR must be charged to a Project PPMP (backed by a LIB) or name its project.');

            return $results;
        }
        $results[] = $this->row(null, 'Project', 'Passed', "Project: {$project}.");

        $prTotal = (float) $pr->items->sum(fn (PurchaseRequestItem $item) => (float) $item->quantity * (float) $item->unit_cost);

        foreach ($pr->items as $item) {
            if (! $this->inPpmp($pr, $item)) {
                $results[] = $this->row($item, 'PPMP', 'Failed', self::ERROR_NOT_IN_PPMP.'.');
                $results[] = $this->row($item, 'Line-Item Budget', 'N/A', 'Not checked; the item is not in the PPMP.');
                $results[] = $this->row($item, 'APP-Non-CSE', 'N/A', 'Not checked; the item is not in the PPMP.');

                continue;
            }
            $results[] = $this->row($item, 'PPMP', 'Passed', 'Item is in the PPMP.');

            [$withinBudget, $budgetMessage] = $this->withinBudget($pr, $item, $prTotal);
            if (! $withinBudget) {
                $results[] = $this->row($item, 'Line-Item Budget', 'Failed', self::ERROR_NOT_WITHIN_BUDGET.': '.$budgetMessage);
                $results[] = $this->row($item, 'APP-Non-CSE', 'N/A', 'Not checked; the item is not within budget.');

                continue;
            }
            $results[] = $this->row($item, 'Line-Item Budget', 'Passed', $budgetMessage);

            $results[] = $this->inApp($item, cse: false)
                ? $this->row($item, 'APP-Non-CSE', 'Passed', 'Item is in APP-Non-CSE.')
                : $this->row($item, 'APP-Non-CSE', 'Failed', self::ERROR_NOT_IN_APP.'.');
        }

        return $results;
    }

    /** Flowchart: "Identify Project". A Project PPMP names it through its LIB; older PRs name it directly. */
    public function projectName(PurchaseRequest $pr): ?string
    {
        $document = $pr->ppmpDocument;
        if ($document && $document->ppmp_class === 'Project' && $document->libDocument) {
            return trim((string) $document->libDocument->project_title) ?: 'LIB '.$document->libDocument->client_uid;
        }

        return $pr->project?->title;
    }

    private function inPpmp(PurchaseRequest $pr, PurchaseRequestItem $item): bool
    {
        return $this->ppmpLines($pr, $item)->isNotEmpty();
    }

    /** The PPMP lines this PR item draws on: from the charged PPMP, or (older PRs) the project's PPMP. */
    private function ppmpLines(PurchaseRequest $pr, PurchaseRequestItem $item): Collection
    {
        $query = PpmpItem::query();
        if ($pr->ppmp_document_id) {
            $query->where('ppmp_document_id', $pr->ppmp_document_id);
        } else {
            $query->where('project_id', $pr->project_id);
        }

        return $this->matchingItem($query, $item)->get();
    }

    /**
     * Flowchart: "Items within Budget (LIB)?". A charged PPMP caps each item at its PPMP estimated
     * budget, less what other live PRs charged to the same PPMP already draw. An older project PR
     * compares the whole PR total (not each item alone) against the project's available allocation.
     *
     * @return array{0: bool, 1: string}
     */
    private function withinBudget(PurchaseRequest $pr, PurchaseRequestItem $item, float $prTotal): array
    {
        if ($pr->ppmp_document_id) {
            $budget = (float) $this->ppmpLines($pr, $item)->sum('estimated_budget');
            $thisPr = (float) $pr->items
                ->filter(fn (PurchaseRequestItem $other) => $this->sameItem($other, $item))
                ->sum(fn (PurchaseRequestItem $other) => (float) $other->quantity * (float) $other->unit_cost);
            $otherPrs = (float) PurchaseRequestItem::query()
                ->whereHas('purchaseRequest', fn (Builder $query) => $query
                    ->where('ppmp_document_id', $pr->ppmp_document_id)
                    ->whereKeyNot($pr->id)
                    ->whereNotIn('status', PurchaseRequest::RELEASED_STATUSES))
                ->where(fn (Builder $query) => $item->procurement_item_id
                    ? $query->where('procurement_item_id', $item->procurement_item_id)->orWhereRaw('LOWER(TRIM(name)) = ?', [$this->key($item->name)])
                    : $query->whereRaw('LOWER(TRIM(name)) = ?', [$this->key($item->name)]))
                ->get()
                ->sum(fn (PurchaseRequestItem $other) => (float) $other->quantity * (float) $other->unit_cost);
            $available = $budget - $otherPrs;

            return $thisPr <= $available + 0.005
                ? [true, 'Within the PPMP budget: ₱'.$this->money($thisPr).' requested; ₱'.$this->money(max(0, $available)).' of this item\'s budget was available.']
                : [false, '₱'.$this->money($thisPr).' requested, but only ₱'.$this->money(max(0, $available)).' of this item\'s PPMP budget remains.'];
        }

        $allocations = BudgetAllocation::where('project_id', $pr->project_id)->get();
        if ($allocations->isEmpty()) {
            return [false, 'No budget allocation was found for this project.'];
        }
        $available = (float) $allocations->sum('allocated_amount') - (float) $allocations->sum('obligated_amount');

        return $prTotal <= $available + 0.005
            ? [true, 'The PR total ₱'.$this->money($prTotal).' is within the available ₱'.$this->money($available).'.']
            : [false, 'the PR total ₱'.$this->money($prTotal).' exceeds the available ₱'.$this->money($available).'.'];
    }

    /**
     * Is the item in the consolidated APP-CSE (or APP-Non-CSE)? Encoded APP rows count, and so does
     * any approved PPMP line for the item classified the same way — the APP is consolidated from
     * exactly those lines, so a PR is never blocked by a consolidation that has not been re-run yet.
     */
    private function inApp(PurchaseRequestItem $item, bool $cse): bool
    {
        $model = $cse ? AppCseItem::query() : AppNonCseItem::query();
        if ($item->procurement_item_id) {
            $model->where('procurement_item_id', $item->procurement_item_id);
        } else {
            $model->whereHas('item', fn (Builder $query) => $query->whereRaw('LOWER(TRIM(name)) = ?', [$this->key($item->name)]));
        }
        if ($model->exists()) {
            return true;
        }

        return $this->matchingItem(PpmpItem::query()->whereHas('document', fn (Builder $query) => $query->where('status', 'Approved')), $item)
            ->get(['expense_category', 'expense_subcategory'])
            ->contains(fn (PpmpItem $line) => self::isCseExpense($line->expense_category, $line->expense_subcategory) === $cse);
    }

    /** Narrows a PPMP-line query to the lines for this PR item (by catalogue item, or by exact name). */
    private function matchingItem(Builder $query, PurchaseRequestItem $item): Builder
    {
        $name = $this->key($item->name);

        return $query->where(function (Builder $query) use ($item, $name): void {
            if ($item->procurement_item_id) {
                $query->where('procurement_item_id', $item->procurement_item_id);
            }
            $query->orWhereRaw('LOWER(TRIM(item_name)) = ?', [$name])
                ->orWhereHas('item', fn (Builder $query) => $query->whereRaw('LOWER(TRIM(name)) = ?', [$name]));
        });
    }

    private function sameItem(PurchaseRequestItem $a, PurchaseRequestItem $b): bool
    {
        return ($a->procurement_item_id && $a->procurement_item_id === $b->procurement_item_id)
            || $this->key($a->name) === $this->key($b->name);
    }

    /** Classify a PPMP line as Common-Use Supplies & Equipment (APP-CSE) from its expense labels. */
    public static function isCseExpense(?string ...$labels): bool
    {
        $needles = ['common-use', 'common use', 'cse', 'office supplies', 'office supply'];
        foreach ($labels as $label) {
            $text = mb_strtolower(trim((string) $label));
            if ($text === '') {
                continue;
            }
            foreach ($needles as $needle) {
                if (str_contains($text, $needle)) {
                    return true;
                }
            }
        }

        return false;
    }

    private function key(?string $name): string
    {
        return mb_strtolower(trim((string) $name));
    }

    private function money(float $amount): string
    {
        return number_format($amount, 2);
    }

    private function row(?PurchaseRequestItem $item, string $label, string $status, string $message): array
    {
        return ['purchase_request_item_id' => $item?->id, 'label' => $label, 'status' => $status, 'message' => $message];
    }
}
