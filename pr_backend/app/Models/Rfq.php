<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Rfq extends Model
{
    protected $fillable = [
        'rfq_no',
        'purchase_request_id',
        'procurement_category',
        'quotation_no',
        'rfq_date',
        'opening_date',
        'place_of_delivery',
        'estimated_budget',
        'bac_chairman',
        'bac_chairman_title',
        'purpose',
        'fund_source_snapshot',
        'canvasser',
        'bac_action',
        'bac_chair_signed_by',
        'bac_chair_signed_name',
        'bac_chair_signed_at',
        'bac_vice_chair_signed_by',
        'bac_vice_chair_signed_name',
        'bac_vice_chair_signed_at',
        'supply_officer_signed_by',
        'supply_officer_signed_name',
        'supply_officer_signed_at',
        'bac_signed_by',
        'bac_signed_name',
        'bac_signed_role',
        'bac_signed_at',
        'twg_evaluation_notes',
        'status',
        'stage',
        'created_by',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'estimated_budget' => 'decimal:2',
            'bac_chair_signed_at' => 'datetime',
            'bac_vice_chair_signed_at' => 'datetime',
            'supply_officer_signed_at' => 'datetime',
            'bac_signed_at' => 'datetime',
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

    public function suppliers(): HasMany
    {
        return $this->hasMany(RfqSupplier::class);
    }

    public function abstractOfCanvas(): HasOne
    {
        return $this->hasOne(AbstractOfCanvas::class);
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
