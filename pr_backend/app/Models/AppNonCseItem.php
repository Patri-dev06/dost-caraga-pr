<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppNonCseItem extends Model
{
    protected $fillable = ['project_id', 'procurement_item_id', 'code', 'quantity', 'estimated_cost'];

    public function item(): BelongsTo
    {
        return $this->belongsTo(ProcurementItem::class, 'procurement_item_id');
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
