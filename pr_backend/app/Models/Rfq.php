<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Rfq extends Model
{
    protected $fillable = [
        'rfq_no',
        'purchase_request_id',
        'quotation_no',
        'rfq_date',
        'opening_date',
        'place_of_delivery',
        'estimated_budget',
        'bac_chairman',
        'bac_chairman_title',
        'purpose',
        'fund_source_snapshot',
        'supplier_name',
        'supplier_address',
        'supplier_by',
        'supplier_contact_no',
        'supplier_tin',
        'canvasser',
        'bac_action',
        'status',
        'stage',
        'created_by',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'estimated_budget' => 'decimal:2',
            'submitted_at' => 'datetime',
        ];
    }

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(RfqItem::class);
    }

    public function purchaseOrders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class);
    }

    public function approvalActions(): MorphMany
    {
        return $this->morphMany(ApprovalAction::class, 'actionable');
    }
}
