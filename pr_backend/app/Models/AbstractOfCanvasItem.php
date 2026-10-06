<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AbstractOfCanvasItem extends Model
{
    protected $fillable = [
        'abstract_of_canvas_id',
        'rfq_item_id',
        'winning_rfq_supplier_id',
        'awarded_unit_price',
        'awarded_total_price',
        'selection_reason',
    ];

    protected function casts(): array
    {
        return [
            'awarded_unit_price' => 'decimal:2',
            'awarded_total_price' => 'decimal:2',
        ];
    }

    public function abstractOfCanvas(): BelongsTo
    {
        return $this->belongsTo(AbstractOfCanvas::class);
    }

    public function rfqItem(): BelongsTo
    {
        return $this->belongsTo(RfqItem::class);
    }

    public function winningSupplier(): BelongsTo
    {
        return $this->belongsTo(RfqSupplier::class, 'winning_rfq_supplier_id');
    }
}
