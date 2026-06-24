<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PpmpDocument extends Model
{
    protected $fillable = [
        'project_id',
        'ppmp_no',
        'fiscal_year',
        'end_user_unit',
        'document_type',
        'source_filename',
        'prepared_submitted_by_name',
        'prepared_submitted_by_position',
        'prepared_submitted_by_date',
        'budget_officer_name',
        'budget_officer_position',
        'budget_certified_date',
        'total_estimated_budget',
        'row_count',
        'imported_by',
        'imported_at',
    ];

    protected function casts(): array
    {
        return [
            'fiscal_year' => 'integer',
            'total_estimated_budget' => 'decimal:2',
            'row_count' => 'integer',
            'prepared_submitted_by_date' => 'date',
            'budget_certified_date' => 'date',
            'imported_at' => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function importer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'imported_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PpmpItem::class);
    }
}
