<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RfqQuoteItem extends Model
{
    protected $fillable = [
        'rfq_supplier_id',
        'rfq_item_id',
        'unit_price',
        'total_price',
        'twg_complies',
        'twg_remarks',
        'is_awarded',
        'award_remarks',
    ];

    protected function casts(): array
    {
        return [
            'unit_price' => 'decimal:2',
            'total_price' => 'decimal:2',
            'twg_complies' => 'boolean',
            'is_awarded' => 'boolean',
        ];
    }

    /** A quote the TWG marked as failing the specification is passed over however cheap it is. */
    public function isCompliant(): bool
    {
        return $this->twg_complies !== false;
    }

    /** "NONE" on the printed form: the supplier did not offer this line at all. */
    public function isQuoted(): bool
    {
        return $this->unit_price !== null;
    }

    public function rfqSupplier(): BelongsTo
    {
        return $this->belongsTo(RfqSupplier::class);
    }

    public function rfqItem(): BelongsTo
    {
        return $this->belongsTo(RfqItem::class);
    }
}
