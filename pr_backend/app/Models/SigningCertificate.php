<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A user's registered PNPKI certificate (see config/pnpki.php). */
class SigningCertificate extends Model
{
    protected $fillable = [
        'user_id', 'encrypted_p12', 'subject_cn', 'subject_dn', 'email', 'serial', 'issuer_cn', 'issuer_dn',
        'fingerprint_sha256', 'valid_from', 'valid_to', 'certificate_pem', 'chain_pem', 'issuer_trusted', 'removed_at',
    ];

    // The key material never leaves the model in any API payload.
    protected $hidden = ['encrypted_p12'];

    protected function casts(): array
    {
        return [
            'valid_from' => 'datetime',
            'valid_to' => 'datetime',
            'removed_at' => 'datetime',
            'issuer_trusted' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('removed_at');
    }

    public function isExpired(): bool
    {
        return $this->valid_to->isPast();
    }

    /** @return array<string, mixed> */
    public function summary(): array
    {
        return [
            'id' => $this->id,
            'subject_cn' => $this->subject_cn,
            'email' => $this->email,
            'serial' => $this->serial,
            'issuer_cn' => $this->issuer_cn,
            'valid_from' => $this->valid_from?->toISOString(),
            'valid_to' => $this->valid_to?->toISOString(),
            'expired' => $this->isExpired(),
            'issuer_trusted' => $this->issuer_trusted,
            // Enough to compare with the certificate details in Adobe Reader.
            'fingerprint' => implode(':', str_split(strtoupper(substr($this->fingerprint_sha256, 0, 16)), 2)),
            'registered_at' => $this->created_at?->toISOString(),
        ];
    }
}
