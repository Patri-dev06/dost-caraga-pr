<?php

namespace App\Http\Controllers\Concerns;

use App\Models\SignedCopy;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

/**
 * Wet signatures: there is no signing inside the system for now (e-signatures are off until PNPKI).
 * A document passes its final signing step only with the scan of its signed copy attached, uploaded
 * by the designated signatory or — for procurement documents — by the Supply team on their behalf.
 *
 * Needs HasProcurementHelpers on the same class (canEditMonitoring).
 */
trait HandlesSignedCopies
{
    /** The uploaded scan, validated; required unless turned off (config/features.php). */
    private function signedCopyFile(Request $request): ?UploadedFile
    {
        $request->validate([
            'signed_copy' => [config('features.signed_copy_required') ? 'required' : 'nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ], [
            'signed_copy.required' => 'Attach the scanned copy with the wet signatures (PDF or photo) before proceeding.',
            'signed_copy.mimes' => 'The signed copy must be a PDF or a JPG/PNG photo.',
            'signed_copy.max' => 'The signed copy must be 10 MB or smaller.',
        ]);

        return $request->file('signed_copy');
    }

    /**
     * The designated signatory may complete the step; so may the Supply team, uploading the signed
     * copy on their behalf. Returns true when it is done on behalf of the signatory.
     */
    private function abortUnlessSignatoryOrSupply(?User $user, bool $isSignatory, string $signatoryLabel): bool
    {
        if ($isSignatory) {
            return false;
        }

        abort_unless($this->canEditMonitoring($user), 403,
            "Only the {$signatoryLabel}, or the Supply team uploading the signed copy for them, may do this.");

        return true;
    }

    private function storeSignedCopy(Request $request, Model $document, string $step, string $signedFor, ?UploadedFile $file, bool $onBehalf): ?SignedCopy
    {
        if ($file === null) {
            return null;
        }

        $path = $file->store('signed-copies/'.Str::kebab(class_basename($document)).'/'.$document->getKey(), 'local');

        return SignedCopy::create([
            'documentable_type' => $document::class,
            'documentable_id' => $document->getKey(),
            'step' => $step,
            'signed_for' => $signedFor,
            'on_behalf' => $onBehalf,
            'path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'mime' => $file->getMimeType(),
            'size' => $file->getSize(),
            'uploaded_by' => $request->user()?->id,
        ]);
    }

    /** "Maria Santos (Regional Director)", or just the role when no one is designated. */
    private function signatoryName(?User $signatory, string $role): string
    {
        return $signatory ? "{$signatory->name} ({$role})" : $role;
    }

    /** "Signed copy uploaded by Ana Supply for the Regional Director." — kept on the approval trail. */
    private function onBehalfNote(Request $request, bool $onBehalf, string $signatoryLabel, ?string $remarks): ?string
    {
        if (! $onBehalf) {
            return $remarks;
        }

        $note = 'Signed copy uploaded by '.($request->user()?->name ?? 'Supply')." for the {$signatoryLabel}.";

        return $remarks ? "{$note} {$remarks}" : $note;
    }

    /** @return list<array<string, mixed>> */
    private function signedCopiesOf(Model $document): array
    {
        return SignedCopy::with('uploader:id,name')
            ->where('documentable_type', $document::class)
            ->where('documentable_id', $document->getKey())
            ->latest('id')
            ->get()
            ->map(fn (SignedCopy $copy) => $copy->summary())
            ->all();
    }
}
