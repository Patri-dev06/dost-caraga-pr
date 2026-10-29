<?php

/*
| PNPKI digital signatures (DICT). Each signatory registers their PNPKI certificate (.p12) once; it is
| kept encrypted with PNPKI_STORAGE_KEY on top of its own password, and the password is asked at every
| signing and never stored. Run `php artisan pnpki:check` after setting this up on a server.
*/
return [
    'enabled' => (bool) env('PNPKI_ENABLED', false),

    // The Python helper (signing/pnpki.py) that opens .p12 files and signs PDFs, and its interpreter.
    'python' => env('PNPKI_PYTHON') ?: base_path('signing/.venv/bin/python'),
    'helper' => base_path('signing/pnpki.py'),
    'timeout' => (int) env('PNPKI_TIMEOUT', 60),

    // The encryption key for stored .p12 files — separate from APP_KEY. Make one with `php artisan pnpki:key`.
    'storage_key' => env('PNPKI_STORAGE_KEY'),

    // PEM file with the PNPKI CA certificates (root and intermediates) a certificate must chain to.
    'trusted_ca' => env('PNPKI_TRUSTED_CA') ?: storage_path('app/pnpki/trusted-ca.pem'),
    'require_trusted_ca' => (bool) env('PNPKI_REQUIRE_TRUSTED_CA', true),

    // The name on the certificate must match the account's name (or its email).
    'require_name_match' => (bool) env('PNPKI_REQUIRE_NAME_MATCH', true),

    // Wrong certificate passwords allowed before the user must wait.
    'password_attempts' => 5,
    'lockout_minutes' => 15,
];
