<?php

namespace App\Services\Pnpki;

use App\Models\SigningCertificate;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Registering a user's PNPKI certificate and unlocking it with its password at signing.
 *
 * A certificate is accepted only if its password opens it, it may sign, it is valid today, it chains
 * to a trusted PNPKI CA, and it carries the account holder's name (or email). Wrong passwords count
 * towards a short lockout, so a stolen session cannot guess the password.
 */
class PnpkiCertificates
{
    public function __construct(private PnpkiHelper $helper, private PnpkiVault $vault) {}

    public function activeFor(User $user): ?SigningCertificate
    {
        return SigningCertificate::where('user_id', $user->id)->active()->latest('id')->first();
    }

    /** Checks and stores the .p12 as the user's certificate, replacing (and erasing) any earlier one. */
    public function register(User $user, string $p12, string $password): SigningCertificate
    {
        $this->abortIfLockedOut($user);
        $info = $this->inspect($user, $p12, $password, 'password');

        if (! ($info['can_sign'] ?? false)) {
            $this->fail('certificate', 'This certificate is not allowed to sign documents. Use your PNPKI individual signing certificate.');
        }
        if (! ($info['currently_valid'] ?? false)) {
            $this->fail('certificate', Carbon::parse($info['valid_to'])->isPast()
                ? 'This certificate expired on '.Carbon::parse($info['valid_to'])->toFormattedDateString().'. Renew it with DICT, then register the new one.'
                : 'This certificate is not valid until '.Carbon::parse($info['valid_from'])->toFormattedDateString().'.');
        }
        if (config('pnpki.require_trusted_ca') && ! ($info['trusted'] ?? false)) {
            $this->fail('certificate', 'This certificate was not issued by a trusted PNPKI certificate authority ('.($info['issuer_cn'] ?: 'unknown issuer').').');
        }
        if (config('pnpki.require_name_match') && ! self::belongsTo($info, $user)) {
            $this->fail('certificate', "This certificate belongs to {$info['subject_cn']}, not to {$user->name}. Each person registers their own certificate.");
        }

        $encrypted = $this->vault->encrypt($p12);

        return DB::transaction(function () use ($user, $info, $encrypted): SigningCertificate {
            $this->eraseActive($user);

            return SigningCertificate::create([
                'user_id' => $user->id,
                'encrypted_p12' => $encrypted,
                'subject_cn' => $info['subject_cn'],
                'subject_dn' => $info['subject_dn'],
                'email' => $info['email'] ?: null,
                'serial' => $info['serial'],
                'issuer_cn' => $info['issuer_cn'] ?: null,
                'issuer_dn' => $info['issuer_dn'],
                'fingerprint_sha256' => $info['fingerprint_sha256'],
                'valid_from' => Carbon::parse($info['valid_from']),
                'valid_to' => Carbon::parse($info['valid_to']),
                'certificate_pem' => $info['certificate_pem'],
                'chain_pem' => $info['chain_pem'] ?: null,
                'issuer_trusted' => (bool) $info['trusted'],
            ]);
        });
    }

    /** Removes the user's certificate and erases its key material; the record of it stays. */
    public function eraseActive(User $user): void
    {
        SigningCertificate::where('user_id', $user->id)->active()->update(['removed_at' => now(), 'encrypted_p12' => null]);
    }

    /**
     * Opens the user's stored certificate with the password they just typed.
     *
     * @return array{0: SigningCertificate, 1: string} the certificate and the .p12 bytes, for signing
     */
    public function unlock(User $user, string $password): array
    {
        $certificate = $this->activeFor($user);
        if ($certificate === null || $certificate->encrypted_p12 === null) {
            $this->fail('password', 'Register your PNPKI certificate first (account menu → My Digital Signature).');
        }
        if ($certificate->isExpired()) {
            $this->fail('password', 'Your PNPKI certificate expired on '.$certificate->valid_to->toFormattedDateString().'. Register your renewed certificate first.');
        }

        $this->abortIfLockedOut($user);
        $p12 = $this->vault->decrypt($certificate->encrypted_p12);
        $info = $this->inspect($user, $p12, $password, 'password');
        abort_unless(hash_equals($certificate->fingerprint_sha256, (string) $info['fingerprint_sha256']), 409, 'The stored certificate does not match its record. Register your certificate again.');

        return [$certificate, $p12];
    }

    /** "JUAN P. DELA CRUZ" on the certificate matches the account "Juan Dela Cruz"; so does the same email. */
    public static function belongsTo(array $info, User $user): bool
    {
        if (! empty($info['email']) && strcasecmp((string) $info['email'], (string) $user->email) === 0) {
            return true;
        }

        $words = fn (string $name): array => array_values(array_unique(array_filter(
            preg_split('/\s+/', trim(preg_replace('/[^A-Z]+/', ' ', mb_strtoupper(Str::ascii($name)))) ?: ''),
            fn (string $word) => strlen($word) > 1,
        )));
        $certificate = $words((string) ($info['subject_cn'] ?? ''));
        $account = $words((string) $user->name);
        if ($certificate === [] || $account === []) {
            return false;
        }

        // Every word of the shorter name appears in the longer one (initials and suffixes aside).
        [$shorter, $longer] = count($certificate) <= count($account) ? [$certificate, $account] : [$account, $certificate];

        return count($shorter) >= 2 && array_diff($shorter, $longer) === [];
    }

    /** @return list<string> the trusted PNPKI CA certificates, as PEM */
    public static function trustedRoots(): array
    {
        $path = (string) config('pnpki.trusted_ca');
        $pem = is_file($path) ? (string) file_get_contents($path) : '';
        preg_match_all('/-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----/s', $pem, $matches);

        return $matches[0];
    }

    /** @return array<string, mixed> */
    private function inspect(User $user, string $p12, string $password, string $passwordField): array
    {
        $roots = self::trustedRoots();
        if ($roots === [] && config('pnpki.require_trusted_ca')) {
            throw new PnpkiUnavailable('Digital signing is not set up on the server yet (the PNPKI CA certificates are missing). Ask the system administrator to run `php artisan pnpki:check`.');
        }

        $info = $this->helper->call(['command' => 'inspect', 'p12' => base64_encode($p12), 'password' => $password, 'trusted_roots' => $roots]);
        if ($info['ok'] ?? false) {
            RateLimiter::clear($this->lockoutKey($user));

            return $info;
        }

        if (($info['error'] ?? null) === 'wrong_password') {
            RateLimiter::hit($this->lockoutKey($user), (int) config('pnpki.lockout_minutes', 15) * 60);
            $left = max(0, (int) config('pnpki.password_attempts', 5) - RateLimiter::attempts($this->lockoutKey($user)));
            $this->fail($passwordField, 'The certificate password is incorrect.'.($left > 0 ? " {$left} attempt(s) left before a short lockout." : ''));
        }

        $this->fail('certificate', (string) ($info['message'] ?? 'The certificate could not be read.'));
    }

    private function abortIfLockedOut(User $user): void
    {
        $key = $this->lockoutKey($user);
        if (RateLimiter::tooManyAttempts($key, (int) config('pnpki.password_attempts', 5))) {
            $minutes = max(1, (int) ceil(RateLimiter::availableIn($key) / 60));
            throw new HttpResponseException(response()->json([
                'message' => "Too many wrong certificate passwords. Try again in {$minutes} minute(s).",
            ], 429));
        }
    }

    private function lockoutKey(User $user): string
    {
        return 'pnpki-password:'.$user->id;
    }

    private function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
