<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RfqItem extends Model
{
    protected $fillable = [
        'rfq_id',
        'purchase_request_item_id',
        'item_no',
        'description',
        'uom',
        'quantity',
        'unit_abc',
        'total_abc',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:2',
            'unit_abc' => 'decimal:2',
            'total_abc' => 'decimal:2',
        ];
    }

    public function rfq(): BelongsTo
    {
        return $this->belongsTo(Rfq::class);
    }

    public function purchaseRequestItem(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequestItem::class);
    }

    /** Per-supplier prices quoted for this line item (one per canvassed supplier). */
    public function quoteItems(): HasMany
    {
        return $this->hasMany(RfqQuoteItem::class);
    }
}
