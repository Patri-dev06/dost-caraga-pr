<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LibLineItem extends Model
{
    protected $fillable = [
        'lib_entry_id',
        'main_category',
        'sub_category',
        'specific_item',
        'custom_item_name',
        'approved_lib_amount',
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec_amount',
        'total',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'approved_lib_amount' => 'decimal:2',
            'jan' => 'decimal:2',
            'feb' => 'decimal:2',
            'mar' => 'decimal:2',
            'apr' => 'decimal:2',
            'may' => 'decimal:2',
            'jun' => 'decimal:2',
            'jul' => 'decimal:2',
            'aug' => 'decimal:2',
            'sep' => 'decimal:2',
            'oct' => 'decimal:2',
            'nov' => 'decimal:2',
            'dec_amount' => 'decimal:2',
            'total' => 'decimal:2',
            'sort_order' => 'integer',
        ];
    }

    public function libEntry(): BelongsTo
    {
        return $this->belongsTo(LibEntry::class);
    }
}
