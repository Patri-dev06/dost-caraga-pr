<?php

namespace App\Services\Pnpki;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Encryption\Encrypter;

/** Encrypts stored .p12 files with PNPKI_STORAGE_KEY (AES-256-GCM), separate from APP_KEY. */
class PnpkiVault
{
    public static function generateKey(): string
    {
        return 'base64:'.base64_encode(Encrypter::generateKey('aes-256-gcm'));
    }

    public function encrypt(string $bytes): string
    {
        return $this->encrypter()->encryptString(base64_encode($bytes));
    }

    public function decrypt(string $payload): string
    {
        try {
            return base64_decode($this->encrypter()->decryptString($payload), true) ?: throw new DecryptException('Not base64.');
        } catch (DecryptException) {
            throw new PnpkiUnavailable('The stored certificate cannot be opened with the server\'s current PNPKI storage key. Register your certificate again, or ask the system administrator.');
        }
    }

    private function encrypter(): Encrypter
    {
        $key = (string) config('pnpki.storage_key');
        $raw = str_starts_with($key, 'base64:') ? base64_decode(substr($key, 7), true) : $key;
        if (! is_string($raw) || strlen($raw) !== 32) {
            throw new PnpkiUnavailable('Digital signing is not set up on the server yet (PNPKI_STORAGE_KEY is missing). Ask the system administrator to run `php artisan pnpki:key`.');
        }

        return new Encrypter($raw, 'aes-256-gcm');
    }
}
