<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/** The scan of a wet-signed document, attached at the step its signatures complete. */
class SignedCopy extends Model
{
    /** What each step's scan is called on screen. */
    public const STEP_LABELS = [
        'pr_approved' => 'Signed Purchase Request',
        'rfq_signed' => 'Signed Request for Quotation',
        'aoc_bac_passed' => 'Signed Abstract of Canvass',
        'po_approved' => 'Signed Purchase Order',
        'ppmp_approved' => 'Signed PPMP',
        'lib_approved' => 'Signed Line-Item Budget',
    ];

    protected $fillable = [
        'documentable_type', 'documentable_id', 'step', 'signed_for', 'on_behalf',
        'path', 'original_name', 'mime', 'size', 'uploaded_by',
    ];

    protected function casts(): array
    {
        return ['on_behalf' => 'boolean', 'size' => 'integer'];
    }

    public function documentable(): MorphTo
    {
        return $this->morphTo();
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    /** @return array<string, mixed> */
    public function summary(): array
    {
        return [
            'id' => $this->id,
            'step' => $this->step,
            'label' => self::STEP_LABELS[$this->step] ?? 'Signed copy',
            'signed_for' => $this->signed_for,
            'on_behalf' => $this->on_behalf,
            'original_name' => $this->original_name,
            'uploaded_by' => $this->uploader?->name,
            'uploaded_at' => $this->created_at?->toISOString(),
        ];
    }
}
