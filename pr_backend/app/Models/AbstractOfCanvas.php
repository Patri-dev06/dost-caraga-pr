<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class AbstractOfCanvas extends Model
{
    protected $fillable = [
        'rfq_id',
        'procurement_category',
        'twg_evaluation_notes',
        'winning_rfq_supplier_id',
        'status',
        'bac_remarks',
        'twg_response',
        'venue_rating_summary',
        'supply_noted_by',
        'supply_noted_name',
        'supply_noted_at',
        'bac_approved_at',
        'created_by',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'venue_rating_summary' => 'array',
            'supply_noted_at' => 'datetime',
            'bac_approved_at' => 'datetime',
        ];
    }

    public function rfq(): BelongsTo
    {
        return $this->belongsTo(Rfq::class);
    }

    public function winningSupplier(): BelongsTo
    {
        return $this->belongsTo(RfqSupplier::class, 'winning_rfq_supplier_id');
    }

    public function venueRatings(): HasMany
    {
        return $this->hasMany(VenueRating::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Full BAC-review history (fail/respond/re-review rounds) via the shared approval trail. */
    public function approvalActions(): MorphMany
    {
        return $this->morphMany(ApprovalAction::class, 'actionable');
    }
}
