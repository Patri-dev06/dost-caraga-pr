<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class LibEntry extends Model
{
    protected $fillable = [
        'project_id',
        'fund_source_id',
        'budget_year',
        'pap_code',
        'program_title',
        'implementing_agency',
        'total_duration',
        'cooperating_agency',
        'project_leader',
        'monitoring_agency',
        'object_of_expenditure',
        'account_code',
        'allocated_amount',
        'available_amount',
        'status',
        'version',
        'parent_id',
        'created_by',
        'approved_at',
        'cancelled_at',
        'cancellation_reason',
    ];

    protected function casts(): array
    {
        return [
            'allocated_amount' => 'decimal:2',
            'available_amount' => 'decimal:2',
            'budget_year' => 'integer',
            'version' => 'integer',
            'approved_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function fundSource(): BelongsTo
    {
        return $this->belongsTo(FundSource::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function amendments(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function lineItems(): HasMany
    {
        return $this->hasMany(LibLineItem::class)->orderBy('sort_order');
    }

    public function ppmpItems(): HasMany
    {
        return $this->hasMany(PpmpItem::class, 'lib_entry_id');
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
