<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** The Supply team's own entries on one PR's row of the Procurement Monitoring Sheet. */
class PrMonitoringEntry extends Model
{
    protected $fillable = ['purchase_request_id', 'values', 'updated_by'];

    protected function casts(): array
    {
        return ['values' => 'array'];
    }

    public function purchaseRequest(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequest::class);
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
