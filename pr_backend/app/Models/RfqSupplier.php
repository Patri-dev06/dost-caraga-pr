<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RfqSupplier extends Model
{
    protected $fillable = [
        'rfq_id',
        'supplier_id',
        'supplier_name',
        'supplier_address',
        'supplier_contact_no',
        'supplier_tin',
        'supplier_by',
        'sent_at',
        'reply_due_at',
        'replied_at',
        'status',
        'replaced_by_supplier_id',
        'is_winner',
        'remarks',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
            'reply_due_at' => 'datetime',
            'replied_at' => 'datetime',
            'is_winner' => 'boolean',
        ];
    }

    public function rfq(): BelongsTo
    {
        return $this->belongsTo(Rfq::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function replacedBy(): BelongsTo
    {
        return $this->belongsTo(self::class, 'replaced_by_supplier_id');
    }

    public function quoteItems(): HasMany
    {
        return $this->hasMany(RfqQuoteItem::class);
    }

    /** Past its 7-day reply window and still awaiting a reply. */
    public function getIsOverdueAttribute(): bool
    {
        return $this->status === 'Sent' && $this->reply_due_at !== null && $this->reply_due_at->isPast();
    }
}
