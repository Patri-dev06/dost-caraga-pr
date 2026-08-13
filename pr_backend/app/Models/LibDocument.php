<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LibDocument extends Model
{
    protected $fillable = [
        'client_uid',
        'fiscal_year',
        'program_title',
        'project_title',
        'implementing_agency',
        'total_duration',
        'duration_from',
        'duration_to',
        'cooperating_agency',
        'project_leader',
        'monitoring_agency',
        'revision',
        'chargeable_note',
        'prepared_by_name',
        'prepared_by_position',
        'recommending_name',
        'recommending_position',
        'certified_name',
        'certified_position',
        'approved_name',
        'approved_position',
        'status',
        'history',
        'owner_id',
        'owner_name',
        'supervisor_id',
        'budget_officer_id',
        'approved_by_id',
        'submitted_at',
        'recommended_at',
        'certified_at',
        'approved_at',
        'return_reason',
        'review_comment',
        'approval_signature',
    ];

    protected function casts(): array
    {
        return [
            'revision' => 'integer',
            'history' => 'array',
            'duration_from' => 'date',
            'duration_to' => 'date',
            'submitted_at' => 'datetime',
            'recommended_at' => 'datetime',
            'certified_at' => 'datetime',
            'approved_at' => 'datetime',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_id');
    }

    public function budgetOfficer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'budget_officer_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_id');
    }

    public function rows(): HasMany
    {
        return $this->hasMany(LibDocumentRow::class)->orderBy('sort_order');
    }
}
