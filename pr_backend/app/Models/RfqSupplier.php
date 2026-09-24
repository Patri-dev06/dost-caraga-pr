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
        'supplier_email',
        'supplier_by',
        'sent_at',
        'reply_due_at',
        'replied_at',
        'portal_token_hash',
        'portal_token_expires_at',
        'quotation_path',
        'quotation_original_name',
        'quote_submitted_via',
        'status',
        'replaced_by_supplier_id',
        'is_winner',
        'twg_result',
        'twg_evaluated_at',
        'remarks',
    ];

    /** Canvassed suppliers still counted toward the RFQ's 3 (a replaced, timed-out, or failed one is not). */
    public const OPEN_STATUSES = ['Pending', 'Sent', 'Replied'];

    /** Resolved without a usable quotation — each leaves a slot for "Choose n of supplier". */
    public const VACATED_STATUSES = ['TimedOut', 'Failed TWG'];

    protected $hidden = ['portal_token_hash'];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
            'reply_due_at' => 'datetime',
            'replied_at' => 'datetime',
            'portal_token_expires_at' => 'datetime',
            'twg_evaluated_at' => 'datetime',
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
