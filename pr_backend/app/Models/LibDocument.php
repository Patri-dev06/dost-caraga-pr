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
    ];

    protected function casts(): array
    {
        return [
            'revision' => 'integer',
            'history' => 'array',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function rows(): HasMany
    {
        return $this->hasMany(LibDocumentRow::class)->orderBy('sort_order');
    }
}
