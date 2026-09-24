<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class PurchaseOrder extends Model
{
    protected $fillable = [
        'po_no',
        'purchase_request_id',
        'rfq_id',
        'supplier_name',
        'supplier_address',
        'supplier_contact_no',
        'supplier_tin',
        'supplier_email',
        'po_date',
        'delivery_date',
        'place_of_delivery',
        'mode_of_procurement',
        'total_amount',
        'terms_and_conditions',
        'status',
        'stage',
        'created_by',
        'budget_officer_id',
        'budget_officer_name',
        'budget_officer_signed_at',
        'accounting_officer_id',
        'accounting_officer_name',
        'accounting_officer_signed_at',
        'approved_by_id',
        'approved_by_name',
        'approved_by_signed_at',
        'forwarded_to_supplier_at',
        'portal_token_hash',
        'delivery_accepted_at',
        'delivery_responded_by',
        'delivery_waived',
        'delivery_waived_at',
        'delivery_waived_reason',
        'submitted_at',
    ];

    protected $hidden = ['portal_token_hash'];

    /** A PO past these is finished (or dead) and is left alone when its PR is cancelled. */
    public const CLOSED_STATUSES = ['Delivery Accepted', 'Delivery Waived', 'Rejected', 'Cancelled'];

    protected function casts(): array
    {
        return [
            'total_amount' => 'decimal:2',
            'budget_officer_signed_at' => 'datetime',
            'accounting_officer_signed_at' => 'datetime',
            'approved_by_signed_at' => 'datetime',
            'forwarded_to_supplier_at' => 'datetime',
            'delivery_accepted_at' => 'datetime',
            'delivery_waived' => 'boolean',
            'delivery_waived_at' => 'datetime',
            'submitted_at' => 'datetime',
        ];
    }

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class);
    }

    public function rfq(): BelongsTo
    {
        return $this->belongsTo(Rfq::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function budgetOfficer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'budget_officer_id');
    }

    public function accountingOfficer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'accounting_officer_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    public function approvalActions(): MorphMany
    {
        return $this->morphMany(ApprovalAction::class, 'actionable');
    }
}
