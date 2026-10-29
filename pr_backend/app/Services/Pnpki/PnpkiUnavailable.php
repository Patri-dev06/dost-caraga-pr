<?php

namespace App\Services\Pnpki;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** The server is not set up for PNPKI signing (helper, key or CA certificates missing). Shown as HTTP 503. */
class PnpkiUnavailable extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 503);
    }
}
