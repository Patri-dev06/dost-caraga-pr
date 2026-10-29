<?php

namespace App\Services\Pnpki;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

/**
 * Runs the Python helper (signing/pnpki.py) with one JSON request on stdin. Secrets go only through
 * stdin — never the command line, which other processes can read, and never a file.
 */
class PnpkiHelper
{
    /**
     * @param  array<string, mixed>  $request
     * @return array<string, mixed> the helper's reply: ['ok' => true, ...] or ['ok' => false, 'error' => code, 'message' => ...]
     */
    public function call(array $request): array
    {
        $python = (string) config('pnpki.python');
        $helper = (string) config('pnpki.helper');
        if (! is_file($helper) || ! is_executable($python)) {
            throw new PnpkiUnavailable('Digital signing is not set up on the server yet (the signing helper is missing). Ask the system administrator to run `php artisan pnpki:check`.');
        }

        $result = Process::timeout((int) config('pnpki.timeout', 60))
            ->input(json_encode($request, JSON_THROW_ON_ERROR))
            ->run([$python, $helper]);

        $reply = json_decode($result->output(), true);
        if (! $result->successful() || ! is_array($reply)) {
            // Only the helper's own diagnostics are logged; the request (with the secrets) never is.
            Log::error('PNPKI helper failed', ['exit_code' => $result->exitCode(), 'stderr' => mb_substr($result->errorOutput(), 0, 2000)]);
            throw new PnpkiUnavailable('Digital signing is not available on the server right now. Please try again later or tell the system administrator.');
        }

        if (($reply['ok'] ?? false) !== true && ($reply['error'] ?? null) === 'helper_failed') {
            Log::error('PNPKI helper error', ['message' => $reply['message'] ?? null]);
            throw new PnpkiUnavailable('Digital signing failed on the server. Please try again later or tell the system administrator.');
        }

        return $reply;
    }
}
