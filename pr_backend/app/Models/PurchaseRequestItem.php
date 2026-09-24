<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseRequestItem extends Model
{
    protected $fillable = ['purchase_request_id', 'procurement_item_id', 'name', 'description', 'uom', 'quantity', 'unit_cost'];

    protected function casts(): array
    {
        return ['quantity' => 'decimal:2', 'unit_cost' => 'decimal:2'];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(ProcurementItem::class, 'procurement_item_id');
    }

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class);
    }
}
