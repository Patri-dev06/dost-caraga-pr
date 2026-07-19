<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppNonCseItem extends Model
{
    protected $fillable = ['project_id', 'fiscal_year', 'is_consolidated', 'procurement_item_id', 'code', 'quantity', 'estimated_cost'];

    protected function casts(): array
    {
        return ['is_consolidated' => 'boolean', 'fiscal_year' => 'integer'];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(ProcurementItem::class, 'procurement_item_id');
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
