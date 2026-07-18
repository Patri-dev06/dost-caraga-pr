<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PpmpItem extends Model
{
    protected $fillable = [
        'client_uid',
        'ppmp_document_id',
        'project_id',
        'procurement_item_id',
        'row_number',
        'code',
        'expense_category',
        'expense_subcategory',
        'general_description',
        'project_type',
        'item_name',
        'quantity_size',
        'recommended_mode',
        'pre_procurement_conference',
        'procurement_start',
        'procurement_end',
        'delivery_period',
        'source_of_funds',
        'estimated_budget',
        'supporting_documents',
        'remarks',
        'reviewer_comment',
        'quantity',
        'estimated_unit_cost',
        'schedule',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:2',
            'estimated_unit_cost' => 'decimal:2',
            'estimated_budget' => 'decimal:2',
        ];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(PpmpDocument::class, 'ppmp_document_id');
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
