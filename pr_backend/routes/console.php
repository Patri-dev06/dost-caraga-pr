<?php

use App\Services\Pnpki\PnpkiCertificates;
use App\Services\Pnpki\PnpkiHelper;
use App\Services\Pnpki\PnpkiVault;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// PNPKI setup: a storage key for the encrypted .p12 files, and a check that signing is ready.
Artisan::command('pnpki:key', function () {
    $this->line('Add this line to .env (keep it secret, and back it up: losing it means every user registers their certificate again):');
    $this->newLine();
    $this->line('PNPKI_STORAGE_KEY='.PnpkiVault::generateKey());
})->purpose('Generate the encryption key for stored PNPKI certificates');

Artisan::command('pnpki:check', function () {
    $ok = true;
    $report = function (bool $passed, string $label, string $fix = '') use (&$ok): void {
        $ok = $ok && $passed;
        $this->line(($passed ? '  <info>OK</info>   ' : '  <error>FAIL</error> ').$label.($passed || $fix === '' ? '' : " — {$fix}"));
    };

    $report((bool) config('pnpki.enabled'), 'PNPKI_ENABLED is on', 'set PNPKI_ENABLED=true in .env');
    $report(is_executable((string) config('pnpki.python')), 'Python helper environment ('.config('pnpki.python').')',
        'run: python3 -m venv signing/.venv && signing/.venv/bin/pip install -r signing/requirements.txt');
    try {
        (new PnpkiVault)->encrypt('check');
        $report(true, 'PNPKI_STORAGE_KEY is set');
    } catch (Throwable) {
        $report(false, 'PNPKI_STORAGE_KEY is set', 'run: php artisan pnpki:key');
    }
    $roots = PnpkiCertificates::trustedRoots();
    $report($roots !== [] || ! config('pnpki.require_trusted_ca'), count($roots).' trusted PNPKI CA certificate(s) in '.config('pnpki.trusted_ca'),
        'save the DICT PNPKI root and intermediate CA certificates (PEM) to that file');
    if (is_executable((string) config('pnpki.python'))) {
        try {
            $reply = app(PnpkiHelper::class)->call(['command' => 'inspect', 'p12' => base64_encode('not a certificate'), 'password' => '']);
            $report(($reply['error'] ?? null) === 'invalid_file', 'Signing helper runs');
        } catch (Throwable $e) {
            $report(false, 'Signing helper runs', $e->getMessage());
        }
    }

    $this->newLine();
    $ok ? $this->info('PNPKI signing is ready.') : $this->error('PNPKI signing is not ready yet.');

    return $ok ? 0 : 1;
})->purpose('Check that PNPKI digital signing is set up on this server');

// Flowchart: a supplier that has not replied after 7 calendar days has its RFQ cancelled.
Schedule::command('rfq:expire-unanswered')->hourly()->withoutOverlapping();
