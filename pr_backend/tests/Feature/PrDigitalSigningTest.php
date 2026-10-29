<?php

namespace Tests\Feature;

use App\Models\DigitalDocument;
use App\Models\Office;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\User;
use App\Services\Pnpki\PnpkiVault;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * PNPKI digital signing of a PR: the requester at submission, then the recommending officer, then the
 * Regional Director sign the same PDF with their own registered certificates. Uses the test CA in
 * tests/fixtures/pnpki.
 */
class PrDigitalSigningTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private const PASSWORD = 'test-password';

    // A tiny real PNG (1×1), as the signature image.
    private const IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    private User $juan;

    private User $maria;

    private User $pedro;

    protected function setUp(): void
    {
        parent::setUp();
        if (! is_executable((string) config('pnpki.python'))) {
            $this->markTestSkipped('The PNPKI helper is not installed (signing/.venv). See signing/requirements.txt.');
        }
        Storage::fake('local');
        Mail::fake();
        config([
            'pnpki.enabled' => true,
            'pnpki.storage_key' => PnpkiVault::generateKey(),
            'pnpki.trusted_ca' => base_path('tests/fixtures/pnpki/test-root-ca.pem'),
            'features.signed_copy_required' => true,
        ]);

        // Juan recommends; Maria is the designated Regional Director. Each has their own certificate.
        $this->juan = $this->person('Juan Dela Cruz', 'juan.delacruz@dost.gov.ph');
        $this->juan->roles()->sync([Role::where('name', 'Recommender')->value('id')]);
        $this->maria = $this->person('Maria Santos', 'maria.santos@dost.gov.ph');
        $this->maria->roles()->sync([Role::where('name', 'Regional Director')->value('id')]);
        $this->withToken($this->token('superadmin@dost.gov.ph'))->putJson('/api/v1/system-settings', [
            'settings' => [['key' => 'regional_director_user_id', 'value' => (string) $this->maria->id]],
        ])->assertOk();

        // The requester is the seeded admin, here named Pedro Reyes to match their certificate.
        $this->pedro = User::where('email', 'admin@dost.gov.ph')->sole();
        $this->pedro->forceFill(['name' => 'Pedro Reyes', 'signature' => self::IMAGE])->save();

        $this->registerCertificate($this->juan, 'juan.p12');
        $this->registerCertificate($this->maria, 'maria.p12');
        $this->registerCertificate($this->pedro, 'pedro.p12');
    }

    private function person(string $name, string $email): User
    {
        return User::create([
            'name' => $name, 'email' => $email, 'password' => Hash::make('password123'), 'office_id' => Office::first()->id,
            'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr', 'approvals'], 'signature' => self::IMAGE,
        ]);
    }

    private function token(User|string $who): string
    {
        $email = $who instanceof User ? $who->email : $who;

        return $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'password123'])->json('token');
    }

    private function registerCertificate(User $user, string $file): void
    {
        $this->withToken($this->token($user))->withHeaders(['Accept' => 'application/json'])->post('/api/v1/me/pnpki-certificate', [
            'certificate' => new UploadedFile(base_path("tests/fixtures/pnpki/{$file}"), $file, 'application/x-pkcs12', null, true),
            'password' => self::PASSWORD,
        ])->assertCreated();
    }

    private function prPayload(array $extra = []): array
    {
        return $extra + [
            'office_code' => 'RO', 'fund_source' => 'GAA 2026 - MOOE', 'mode_of_procurement' => 'Shopping',
            'purpose' => 'Digital signing test.', 'submit' => true,
            'recommending_officer_id' => $this->juan->id, 'recommending_designation' => 'Chief, FAD', 'approving_designation' => 'Regional Director',
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 2, 'unit_cost' => 250]],
        ];
    }

    /** A PR Pedro submits, routed to Juan — signed digitally at submission unless $digital is false. */
    private function submittedPr(bool $digital = true): int
    {
        return $this->withToken($this->token($this->pedro))
            ->postJson('/api/v1/purchase-requests', $this->prPayload($digital ? ['pnpki_password' => self::PASSWORD] : []))
            ->assertCreated()->assertJsonPath('data.digitally_signed', $digital ? ['requested'] : [])->json('data.id');
    }

    public function test_the_requester_recommending_officer_and_rd_sign_the_same_pdf_digitally(): void
    {
        $prId = $this->submittedPr();
        $this->assertSame('For Recommendation', PurchaseRequest::find($prId)->status);

        $this->withToken($this->token($this->juan))->postJson("/api/v1/approvals/{$prId}/recommend", ['pnpki_password' => self::PASSWORD])
            ->assertOk()->assertJsonPath('data.status', 'For Approval')->assertJsonPath('data.digitally_signed', ['requested', 'recommending']);

        // No scan is needed when the RD signs digitally.
        $this->withToken($this->token($this->maria))->postJson("/api/v1/approvals/{$prId}/approve", ['pnpki_password' => self::PASSWORD])
            ->assertOk()->assertJsonPath('data.status', 'Approved')->assertJsonPath('data.digitally_signed', ['requested', 'recommending', 'approving']);

        $document = DigitalDocument::sole();
        $this->assertSame(3, $document->version);
        // Every version is kept: the unsigned PDF, then one per signature.
        foreach ([0, 1, 2, 3] as $version) {
            Storage::disk('local')->assertExists(dirname($document->path)."/v{$version}.pdf");
        }

        $fields = collect($this->withToken($this->token($this->maria))->getJson("/api/v1/purchase-requests/{$prId}/digital-document?verify=1")
            ->assertOk()->json('data.fields'))->keyBy('name');
        foreach (['requested' => 'PEDRO REYES', 'recommending' => 'JUAN DELA CRUZ', 'approving' => 'MARIA SANTOS'] as $field => $cn) {
            $this->assertSame($cn, $fields[$field]['certificate_cn']);
            $this->assertTrue($fields[$field]['check']['intact'], "{$field} signature is not intact");
            $this->assertTrue($fields[$field]['check']['trusted'], "{$field} signature is not trusted");
        }

        $download = $this->withToken($this->token($this->maria))->get("/api/v1/purchase-requests/{$prId}/digital-document/download")->assertOk();
        $this->assertStringStartsWith('%PDF', $download->streamedContent());

        $trail = PurchaseRequest::find($prId)->approvalActions()->orderBy('id')->pluck('remarks')->filter()->implode(' | ');
        $this->assertStringContainsString('Signed digitally with PNPKI (certificate PEDRO REYES', $trail);
        $this->assertStringContainsString('Signed digitally with PNPKI (certificate JUAN DELA CRUZ', $trail);
        $this->assertStringContainsString('Signed digitally with PNPKI (certificate MARIA SANTOS', $trail);
    }

    public function test_a_wrong_password_signs_nothing_and_moves_nothing(): void
    {
        // At submission, a wrong password stops everything: not even a draft is left behind.
        $before = PurchaseRequest::count();
        $this->withToken($this->token($this->pedro))->postJson('/api/v1/purchase-requests', $this->prPayload(['pnpki_password' => 'wrong']))
            ->assertStatus(422);
        $this->assertSame($before, PurchaseRequest::count());

        $prId = $this->submittedPr();
        $this->withToken($this->token($this->juan))->postJson("/api/v1/approvals/{$prId}/recommend", ['pnpki_password' => 'wrong'])->assertStatus(422);

        $this->assertSame('For Recommendation', PurchaseRequest::find($prId)->status);
        $this->assertSame(1, DigitalDocument::sole()->version);
    }

    public function test_a_pr_submitted_on_paper_is_recommended_on_paper(): void
    {
        $prId = $this->submittedPr(digital: false);

        $this->withToken($this->token($this->juan))->postJson("/api/v1/approvals/{$prId}/recommend", ['pnpki_password' => self::PASSWORD])
            ->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'requester did not sign this PR digitally'));
        $this->assertSame(0, DigitalDocument::count());
    }

    public function test_a_returned_pr_gets_a_new_pdf_when_it_is_resubmitted(): void
    {
        $prId = $this->submittedPr();
        $first = DigitalDocument::sole();
        $this->withToken($this->token($this->juan))->postJson("/api/v1/approvals/{$prId}/return", ['reason' => 'Fix the quantity.'])->assertOk();

        // The old PDF is kept as a record but no longer counts.
        $this->assertNotNull($first->fresh()->superseded_at);
        $pedro = $this->token($this->pedro);
        $this->withToken($pedro)->getJson("/api/v1/purchase-requests/{$prId}")->assertJsonPath('data.digitally_signed', []);

        $this->withToken($pedro)->postJson("/api/v1/purchase-requests/{$prId}/submit", ['pnpki_password' => self::PASSWORD])
            ->assertOk()->assertJsonPath('data.digitally_signed', ['requested']);
        $this->assertSame(2, DigitalDocument::count());
        $current = DigitalDocument::whereNull('superseded_at')->sole();
        $this->assertNotSame(dirname($first->path), dirname($current->path));
        Storage::disk('local')->assertExists($first->path);
    }

    public function test_only_the_named_signatory_signs_digitally_never_someone_for_them(): void
    {
        // Filing a PR for someone else never signs it as them.
        $this->withToken($this->token($this->pedro))
            ->postJson('/api/v1/purchase-requests', $this->prPayload(['pnpki_password' => self::PASSWORD, 'requested_by' => $this->juan->id]))
            ->assertForbidden();

        $prId = $this->submittedPr();
        // The superadmin may recommend on paper, but cannot sign in Juan's place.
        $this->withToken($this->token('superadmin@dost.gov.ph'))->postJson("/api/v1/approvals/{$prId}/recommend", ['pnpki_password' => self::PASSWORD])->assertForbidden();

        $this->withToken($this->token($this->juan))->postJson("/api/v1/approvals/{$prId}/recommend", ['pnpki_password' => self::PASSWORD])->assertOk();
        // Juan's certificate cannot approve as the RD, and neither can the Supply team (Pedro, an admin) digitally.
        $this->withToken($this->token($this->juan))->postJson("/api/v1/approvals/{$prId}/approve", ['pnpki_password' => self::PASSWORD])->assertForbidden();
        $this->withToken($this->token($this->pedro))->postJson("/api/v1/approvals/{$prId}/approve", ['pnpki_password' => self::PASSWORD])->assertForbidden();
        $this->assertSame('For Approval', PurchaseRequest::find($prId)->status);
    }

    public function test_a_pr_recommended_on_paper_is_approved_with_the_scan(): void
    {
        $prId = $this->submittedPr();
        $this->withToken($this->token($this->juan))->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk()->assertJsonPath('data.digitally_signed', ['requested']);

        $maria = $this->token($this->maria);
        $this->withToken($maria)->postJson("/api/v1/approvals/{$prId}/approve", ['pnpki_password' => self::PASSWORD])
            ->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'did not sign this PR digitally'));
        $this->withToken($maria)->withHeaders(['Accept' => 'application/json'])
            ->post("/api/v1/approvals/{$prId}/approve", ['signed_copy' => UploadedFile::fake()->create('signed.pdf', 50, 'application/pdf')])
            ->assertOk()->assertJsonPath('data.status', 'Approved');
    }

    public function test_signing_needs_the_signature_image(): void
    {
        $this->pedro->forceFill(['signature' => null])->save();

        $this->withToken($this->token($this->pedro))->postJson('/api/v1/purchase-requests', $this->prPayload(['pnpki_password' => self::PASSWORD]))
            ->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'signature image'));
    }
}
