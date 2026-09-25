<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One Supplementary Document (SD) attached to a PR at submission — a frozen copy of the source. */
class PurchaseRequestSupportingDocument extends Model
{
    protected $fillable = [
        'purchase_request_id', 'type', 'source_id', 'source_uid', 'reference', 'title', 'total',
        'snapshot', 'attached_by', 'attached_at',
    ];

    protected function casts(): array
    {
        return ['snapshot' => 'array', 'total' => 'decimal:2', 'attached_at' => 'datetime'];
    }

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class);
    }

    public function attacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'attached_by');
    }
}
