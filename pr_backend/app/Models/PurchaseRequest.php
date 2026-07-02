<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class PurchaseRequest extends Model
{
    protected $fillable = [
        'pr_no',
        'office_id',
        'fund_source_id',
        'project_id',
        'requested_by',
        'mode_of_procurement',
        'purpose',
        'status',
        'stage',
        'version',
        'parent_id',
        'submitted_at',
        'approved_at',
        'cancelled_at',
        'cancellation_reason',
    ];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'version' => 'integer',
        ];
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

    public function approvalActions(): HasMany
    {
        return $this->hasMany(ApprovalAction::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function amendments(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function approvalSteps(): MorphMany
    {
        return $this->morphMany(ApprovalStep::class, 'approvable');
    }

    public function isLocked(): bool
    {
        return in_array($this->status, ['Approved', 'Cancelled'], true);
    }
}
