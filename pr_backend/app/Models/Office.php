<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Office extends Model
{
    protected $fillable = ['name', 'code', 'description', 'recommending_officer_id'];

    /** Who a Purchase Request from this office is routed to for recommendation, absent the LGIA override. */
    public function recommendingOfficer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recommending_officer_id');
    }
}
