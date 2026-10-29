<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/** A document's PDF for PNPKI digital signing, and its signatures so far. */
class DigitalDocument extends Model
{
    protected $fillable = ['documentable_type', 'documentable_id', 'kind', 'path', 'version', 'sha256', 'fields', 'superseded_at'];

    protected function casts(): array
    {
        return ['fields' => 'array', 'version' => 'integer', 'superseded_at' => 'datetime'];
    }

    public function documentable(): MorphTo
    {
        return $this->morphTo();
    }

    public function signatures(): HasMany
    {
        return $this->hasMany(DigitalSignature::class)->orderBy('version');
    }

    public function isSigned(string $field): bool
    {
        return $this->signatures->contains('field', $field);
    }
}
