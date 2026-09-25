<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class PurchaseRequest extends Model
{
    protected $fillable = [
        'pr_no',
        'office_id',
        'fund_source_id',
        'project_id',
        'ppmp_document_id',
        'requested_by',
        'mode_of_procurement',
        'purpose',
        'status',
        'stage',
        'submitted_at',
        'cancelled_at',
        'cancel_reason',
        'cancelled_from',
        're_pr_of_id',
    ];

    /** Statuses that no longer draw on a PPMP's budget or quantities. */
    public const RELEASED_STATUSES = ['Rejected', 'Returned', 'Cancelled'];

    protected function casts(): array
    {
        return ['submitted_at' => 'datetime', 'cancelled_at' => 'datetime'];
    }

    /** Modules whose holders work on every PR (approvers, BAC/supply, validators), not just their own. */
    private const CROSS_CUTTING_MODULES = ['approvals', 'rfq', 'po', 'validation'];

    /** Admins/Superadmins and holders of a cross-cutting module see every PR; requesters see only their own. */
    public static function seesAllFor(?User $user): bool
    {
        if ($user === null) {
            return false;
        }

        if (in_array($user->tier, ['superadmin', 'admin'], true)) {
            return true;
        }

        foreach (self::CROSS_CUTTING_MODULES as $module) {
            if ($user->canAccessModule($module)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Where a PR is in the procurement flow, one stage per PR, in flow order. Used for the dashboard's
     * "Where PRs are" counts and the Monitoring Sheet's matching filter, so the two always agree.
     */
    public const STAGES = [
        'draft' => 'Draft',
        'returned' => 'Returned',
        'for_recommendation' => 'For Recommendation',
        'for_approval' => 'For Approval',
        'awaiting_rfq' => 'Approved, awaiting RFQ',
        'rfq' => 'RFQ / Canvassing',
        'aoc' => 'AOC / BAC Review',
        'po' => 'PO Approval',
        'with_supplier' => 'With Supplier',
        'delivered' => 'Delivery Accepted',
        'closed' => 'Cancelled / Rejected',
    ];

    /** POs the supplier has the signed copy of, or has already answered to deliver. */
    private const PO_RELEASED = ['Forwarded to Supplier', 'Delivery Accepted'];

    /** POs that no longer carry the PR forward. */
    private const PO_DEAD = ['Cancelled', 'Delivery Waived'];

    public function scopeInStage(Builder $query, string $stage): Builder
    {
        $liveRfq = fn (Builder $q) => $q->where('status', '!=', 'Cancelled');
        $livePo = fn (Builder $q) => $q->whereNotIn('status', self::PO_DEAD);

        $byStatus = [
            'draft' => ['Draft'], 'returned' => ['Returned'], 'for_recommendation' => ['For Recommendation'],
            'for_approval' => ['For Approval'], 'closed' => ['Cancelled', 'Rejected'],
        ];
        if (isset($byStatus[$stage])) {
            return $query->whereIn('status', $byStatus[$stage]);
        }

        // Past approval, a PR sits at the furthest document it has reached.
        $query->where('status', 'Approved');

        return match ($stage) {
            'delivered' => $query->whereHas('purchaseOrders', fn ($q) => $q->where('status', 'Delivery Accepted')),
            'with_supplier' => $query->whereHas('purchaseOrders', fn ($q) => $q->where('status', 'Forwarded to Supplier'))
                ->whereDoesntHave('purchaseOrders', fn ($q) => $q->where('status', 'Delivery Accepted')),
            'po' => $query->whereHas('purchaseOrders', $livePo)
                ->whereDoesntHave('purchaseOrders', fn ($q) => $q->whereIn('status', self::PO_RELEASED)),
            'aoc' => $query->whereDoesntHave('purchaseOrders', $livePo)
                ->whereHas('rfqs', fn ($q) => $liveRfq($q)->has('abstractOfCanvas')),
            'rfq' => $query->whereDoesntHave('purchaseOrders', $livePo)
                ->whereHas('rfqs', $liveRfq)
                ->whereDoesntHave('rfqs', fn ($q) => $liveRfq($q)->has('abstractOfCanvas')),
            'awaiting_rfq' => $query->whereDoesntHave('purchaseOrders', $livePo)->whereDoesntHave('rfqs', $liveRfq),
            default => $query->whereRaw('1 = 0'),
        };
    }

    public function scopeVisibleTo(Builder $query, ?User $user): Builder
    {
        return self::seesAllFor($user) ? $query : $query->where('requested_by', $user?->id ?? 0);
    }

    public function isVisibleTo(?User $user): bool
    {
        return self::seesAllFor($user) || ($user !== null && $this->requested_by === $user->id);
    }

    /** Only the owner, or an Admin/Superadmin, may edit or submit a PR. */
    public function isManageableBy(?User $user): bool
    {
        return $user !== null && (in_array($user->tier, ['superadmin', 'admin'], true) || $this->requested_by === $user->id);
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function fundSource(): BelongsTo
    {
        return $this->belongsTo(FundSource::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** The planning PPMP this PR is "Charged to". */
    public function ppmpDocument(): BelongsTo
    {
        return $this->belongsTo(PpmpDocument::class);
    }

    /** The cancelled PR this one was re-filed from (the flowchart's "Re-PR"). */
    public function rePrOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 're_pr_of_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseRequestItem::class);
    }

    public function validationResults(): HasMany
    {
        return $this->hasMany(ValidationResult::class);
    }

    public function rfqs(): HasMany
    {
        return $this->hasMany(Rfq::class);
    }

    public function purchaseOrders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class);
    }

    /** The Supply team's hand-kept columns on this PR's Procurement Monitoring Sheet row. */
    public function monitoringEntry(): HasOne
    {
        return $this->hasOne(PrMonitoringEntry::class);
    }

    public function approvalActions(): MorphMany
    {
        return $this->morphMany(ApprovalAction::class, 'actionable');
    }
}
