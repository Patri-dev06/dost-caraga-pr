<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One PNPKI signature on a digital document: who signed which part, with which certificate. */
class DigitalSignature extends Model
{
    protected $fillable = [
        'digital_document_id', 'field', 'label', 'user_id', 'signing_certificate_id', 'signer_name',
        'certificate_cn', 'certificate_serial', 'issuer_cn', 'version', 'sha256', 'signed_at',
    ];

    protected function casts(): array
    {
        return ['signed_at' => 'datetime', 'version' => 'integer'];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(DigitalDocument::class, 'digital_document_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
