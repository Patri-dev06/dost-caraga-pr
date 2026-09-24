<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One rater's 1-5 score for one venue on one criterion (flowchart: "Individual rating of list of venue"). */
class VenueRating extends Model
{
    protected $fillable = [
        'abstract_of_canvas_id',
        'rfq_supplier_id',
        'rater_id',
        'rater_role',
        'criterion',
        'score',
        'remarks',
    ];

    protected function casts(): array
    {
        return ['score' => 'integer'];
    }

    public function abstractOfCanvas(): BelongsTo
    {
        return $this->belongsTo(AbstractOfCanvas::class);
    }

    public function rfqSupplier(): BelongsTo
    {
        return $this->belongsTo(RfqSupplier::class);
    }

    public function rater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rater_id');
    }
}
