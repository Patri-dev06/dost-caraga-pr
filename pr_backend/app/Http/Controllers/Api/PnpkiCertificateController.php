<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Controller;
use App\Services\Pnpki\PnpkiCertificates;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** "My Digital Signature": the signed-in user's PNPKI certificate (.p12), registered once. */
class PnpkiCertificateController extends Controller
{
    use HasProcurementHelpers;

    public function __construct(private PnpkiCertificates $certificates) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => [
            'enabled' => (bool) config('pnpki.enabled'),
            'certificate' => $this->certificates->activeFor($request->user())?->summary(),
        ]]);
    }

    /** Registers (or replaces) the certificate. The password opens it to check it and is not kept. */
    public function store(Request $request): JsonResponse
    {
        $this->abortUnlessEnabled();
        $request->validate([
            'certificate' => ['required', 'file', 'max:100'],
            'password' => ['required', 'string', 'max:200'],
        ], [
            'certificate.required' => 'Choose your PNPKI certificate file (.p12 or .pfx).',
            'certificate.max' => 'That file is too large to be a PNPKI certificate.',
            'password.required' => 'Type the password of your certificate.',
        ]);
        $extension = strtolower($request->file('certificate')->getClientOriginalExtension());
        abort_unless(in_array($extension, ['p12', 'pfx'], true), 422, 'Choose your PNPKI certificate file (.p12 or .pfx).');

        $user = $request->user();
        $certificate = $this->certificates->register($user, (string) $request->file('certificate')->get(), (string) $request->input('password'));
        $this->audit($request, 'Account', 'Registered PNPKI certificate', "{$certificate->subject_cn} · serial {$certificate->serial}");

        return response()->json(['message' => 'Your PNPKI certificate is registered. You will type its password each time you sign.', 'data' => $certificate->summary()], 201);
    }

    /** Checks the password against the stored certificate, so the user knows it works before signing. */
    public function verify(Request $request): JsonResponse
    {
        $this->abortUnlessEnabled();
        $request->validate(['password' => ['required', 'string', 'max:200']]);
        [$certificate] = $this->certificates->unlock($request->user(), (string) $request->input('password'));

        return response()->json(['message' => 'The password opens your certificate.', 'data' => $certificate->summary()]);
    }

    /** Removes the certificate; its encrypted key is erased. */
    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        $certificate = $this->certificates->activeFor($user);
        $this->certificates->eraseActive($user);
        if ($certificate) {
            $this->audit($request, 'Account', 'Removed PNPKI certificate', "{$certificate->subject_cn} · serial {$certificate->serial}");
        }

        return response()->json(['message' => 'Your PNPKI certificate was removed from the system.', 'data' => null]);
    }

    private function abortUnlessEnabled(): void
    {
        abort_unless(config('pnpki.enabled'), 403, 'PNPKI digital signing is not turned on yet.');
    }
}
