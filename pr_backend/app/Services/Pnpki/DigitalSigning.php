<?php

namespace App\Services\Pnpki;

use App\Models\DigitalDocument;
use App\Models\DigitalSignature;
use App\Models\User;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Signs one part of a document's PDF with the signatory's registered PNPKI certificate.
 *
 * The PDF is made from the document's data at its first signature and never regenerated: each later
 * signature is an incremental update of that same file, so earlier signatures stay valid and any
 * change to the content after signing shows as a broken signature in Adobe Reader.
 */
class DigitalSigning
{
    public function __construct(private PnpkiCertificates $certificates, private PnpkiHelper $helper) {}

    /** The document's current signed PDF (not one set aside when the document went back for revision). */
    public static function documentFor(Model $documentable, string $kind): ?DigitalDocument
    {
        return self::current($documentable, $kind)->with('signatures')->first();
    }

    /** Sets the current PDF aside (kept as a record): the document changes, so its signatures no longer apply. */
    public static function supersede(Model $documentable, string $kind): void
    {
        self::current($documentable, $kind)->update(['superseded_at' => now()]);
    }

    private static function current(Model $documentable, string $kind): Builder
    {
        return DigitalDocument::where('documentable_type', $documentable::class)
            ->where('documentable_id', $documentable->getKey())
            ->where('kind', $kind)
            ->whereNull('superseded_at');
    }

    /** Checks the password opens the user's certificate and they have a signature image, before anything is saved. */
    public function preflight(User $user, string $password): void
    {
        $this->abortWithoutImage($user);
        $this->certificates->unlock($user, $password);
    }

    /**
     * @param  Closure(): array{pdf: string, fields: list<array<string, mixed>>}  $generate  builds the unsigned PDF (first signature only)
     */
    public function sign(Model $documentable, string $kind, Closure $generate, string $field, User $user, string $password, string $reason): DigitalSignature
    {
        $this->abortWithoutImage($user);
        [$certificate, $p12] = $this->certificates->unlock($user, $password);

        return DB::transaction(function () use ($documentable, $kind, $generate, $field, $user, $password, $reason, $certificate, $p12): DigitalSignature {
            $document = self::current($documentable, $kind)->lockForUpdate()->first();

            if ($document === null) {
                $built = $generate();
                $document = new DigitalDocument([
                    'documentable_type' => $documentable::class,
                    'documentable_id' => $documentable->getKey(),
                    'kind' => $kind,
                    'version' => 0,
                    'fields' => $built['fields'],
                ]);
                // Each document has its own folder, so a resubmitted PR's new PDF never overwrites the old one.
                $folder = 'digital-documents/'.str_replace('_', '-', $kind).'/'.$documentable->getKey().'/'.now()->format('Ymd-His-u');
                $document->path = $this->store($folder, 0, $built['pdf']);
                $document->sha256 = hash('sha256', $built['pdf']);
                $document->save();
            }

            $spec = collect($document->fields)->firstWhere('name', $field);
            abort_if($spec === null, 422, 'This document has no place for that signature.');
            abort_if($document->signatures()->where('field', $field)->exists(), 422, "The {$spec['label']} part of this document is already signed.");

            $signedAt = now()->timezone(config('app.timezone', 'Asia/Manila'));
            $reply = $this->helper->call([
                'command' => 'sign',
                'pdf' => base64_encode((string) Storage::disk('local')->get($document->path)),
                'p12' => base64_encode($p12),
                'password' => $password,
                'field' => $field,
                'fields' => $document->fields,
                'image' => self::imageBytes($user->signature),
                'reason' => $reason,
                'location' => 'DOST Caraga',
                'signed_at_text' => $signedAt->format('Y.m.d H:i:s P'),
            ]);
            if (! ($reply['ok'] ?? false)) {
                abort(422, (string) ($reply['message'] ?? 'The document could not be signed.'));
            }

            $pdf = base64_decode((string) $reply['pdf'], true) ?: abort(500, 'The signing helper returned an unreadable PDF.');
            $version = $document->version + 1;
            $sha = hash('sha256', $pdf);
            $document->forceFill(['path' => $this->store(dirname($document->path), $version, $pdf), 'version' => $version, 'sha256' => $sha])->save();

            return $document->signatures()->create([
                'field' => $field,
                'label' => $spec['label'],
                'user_id' => $user->id,
                'signing_certificate_id' => $certificate->id,
                'signer_name' => $user->name,
                'certificate_cn' => $certificate->subject_cn,
                'certificate_serial' => $certificate->serial,
                'issuer_cn' => $certificate->issuer_cn,
                'version' => $version,
                'sha256' => $sha,
                'signed_at' => $signedAt,
            ]);
        });
    }

    /** Checks every signature in the latest PDF: intact, by whom, and trusted. */
    public function verify(DigitalDocument $document): array
    {
        $reply = $this->helper->call([
            'command' => 'verify',
            'pdf' => base64_encode((string) Storage::disk('local')->get($document->path)),
            'trusted_roots' => PnpkiCertificates::trustedRoots(),
        ]);

        return $reply['signatures'] ?? [];
    }

    private function store(string $folder, int $version, string $pdf): string
    {
        $path = "{$folder}/v{$version}.pdf";
        Storage::disk('local')->put($path, $pdf);

        return $path;
    }

    private function abortWithoutImage(User $user): void
    {
        if (empty($user->signature)) {
            throw ValidationException::withMessages(['password' => 'Upload your signature image first (account menu → My Digital Signature). It is how your signature appears on the document.']);
        }
    }

    /** The signature image's bytes (base64) from the stored data URL. */
    private static function imageBytes(?string $dataUrl): string
    {
        return preg_match('/^data:image\/[a-z+]+;base64,(.+)$/s', (string) $dataUrl, $m) ? $m[1] : '';
    }
}
