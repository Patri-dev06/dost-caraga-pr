<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Supplier Portal links. Suppliers have no account: each canvassed supplier (and each PO sent to a
 * supplier) gets its own unguessable link. Only the SHA-256 hash is stored, like API tokens, so a
 * database leak does not expose working links; revoking a link is clearing its hash.
 */
final class PortalToken
{
    /** @return array{plain: string, hash: string} */
    public static function issue(): array
    {
        $plain = Str::random(48);

        return ['plain' => $plain, 'hash' => self::hash($plain)];
    }

    public static function hash(string $plain): string
    {
        return hash('sha256', $plain);
    }
}
