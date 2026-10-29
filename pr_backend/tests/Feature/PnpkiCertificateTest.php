<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Office;
use App\Models\SigningCertificate;
use App\Models\User;
use App\Services\Pnpki\PnpkiCertificates;
use App\Services\Pnpki\PnpkiVault;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Registering a PNPKI certificate (.p12): checked, stored encrypted, its password never kept.
 * Uses the made-up test CA in tests/fixtures/pnpki (signing/make_test_certs.py).
 */
class PnpkiCertificateTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private const PASSWORD = 'test-password';

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        if (! is_executable((string) config('pnpki.python'))) {
            $this->markTestSkipped('The PNPKI helper is not installed (signing/.venv). See signing/requirements.txt.');
        }

        config([
            'pnpki.enabled' => true,
            'pnpki.storage_key' => PnpkiVault::generateKey(),
            'pnpki.trusted_ca' => base_path('tests/fixtures/pnpki/test-root-ca.pem'),
            'pnpki.require_trusted_ca' => true,
            'pnpki.require_name_match' => true,
        ]);

        User::create([
            'name' => 'Juan Dela Cruz', 'email' => 'juan.delacruz@dost.gov.ph', 'password' => Hash::make('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr'],
        ]);
        $this->token = $this->postJson('/api/v1/auth/login', ['email' => 'juan.delacruz@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    private function fixture(string $name): UploadedFile
    {
        $path = base_path("tests/fixtures/pnpki/{$name}");

        return new UploadedFile($path, $name, 'application/x-pkcs12', null, true);
    }

    private function register(string $file, string $password = self::PASSWORD): TestResponse
    {
        return $this->withToken($this->token)->withHeaders(['Accept' => 'application/json'])
            ->post('/api/v1/me/pnpki-certificate', ['certificate' => $this->fixture($file), 'password' => $password]);
    }

    public function test_a_certificate_is_checked_and_stored_encrypted_without_its_password(): void
    {
        $this->register('juan.p12')
            ->assertCreated()
            ->assertJsonPath('data.subject_cn', 'JUAN DELA CRUZ')
            ->assertJsonPath('data.issuer_cn', 'Test PNPKI Root CA')
            ->assertJsonPath('data.issuer_trusted', true)
            ->assertJsonMissingPath('data.encrypted_p12');

        $row = DB::table('signing_certificates')->sole();
        $original = file_get_contents(base_path('tests/fixtures/pnpki/juan.p12'));
        // Stored encrypted: neither the file nor its password appear in the row.
        $this->assertStringNotContainsString(base64_encode($original), $row->encrypted_p12);
        $this->assertStringNotContainsString(self::PASSWORD, json_encode($row));
        $this->assertSame($original, (new PnpkiVault)->decrypt($row->encrypted_p12));
        $this->assertStringNotContainsString(self::PASSWORD, AuditLog::pluck('target')->implode(' '));

        $this->withToken($this->token)->getJson('/api/v1/auth/me')->assertJsonPath('data.has_pnpki_certificate', true);
        $this->withToken($this->token)->getJson('/api/v1/me/pnpki-certificate')->assertJsonPath('data.certificate.subject_cn', 'JUAN DELA CRUZ');
    }

    public function test_an_older_p12_that_php_cannot_open_still_registers(): void
    {
        $this->register('juan-legacy.p12')->assertCreated()->assertJsonPath('data.subject_cn', 'JUAN DELA CRUZ');
    }

    public function test_bad_files_and_certificates_are_refused(): void
    {
        $this->register('juan-expired.p12')->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'expired'));
        $this->register('juan-untrusted.p12')->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'not issued by a trusted PNPKI'));
        $this->register('maria.p12')->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'belongs to MARIA SANTOS'));
        $this->register('test-root-ca.pem')->assertStatus(422);
        $this->withToken($this->token)->withHeaders(['Accept' => 'application/json'])
            ->post('/api/v1/me/pnpki-certificate', ['certificate' => UploadedFile::fake()->createWithContent('junk.p12', 'not a certificate'), 'password' => 'x'])
            ->assertStatus(422)->assertJsonValidationErrors('certificate');

        $this->assertSame(0, SigningCertificate::count());
    }

    public function test_wrong_passwords_lead_to_a_short_lockout(): void
    {
        $this->register('juan.p12', 'wrong')->assertStatus(422)->assertJsonValidationErrors('password');
        for ($i = 0; $i < 4; $i++) {
            $this->register('juan.p12', 'wrong')->assertStatus(422);
        }
        // Locked out, even with the right password.
        $this->register('juan.p12')->assertStatus(429);
    }

    public function test_the_password_is_checked_against_the_stored_certificate(): void
    {
        $this->register('juan.p12')->assertCreated();

        $this->withToken($this->token)->postJson('/api/v1/me/pnpki-certificate/verify', ['password' => self::PASSWORD])->assertOk();
        $this->withToken($this->token)->postJson('/api/v1/me/pnpki-certificate/verify', ['password' => 'wrong'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_replacing_or_removing_a_certificate_erases_the_old_key(): void
    {
        $this->register('juan.p12')->assertCreated();
        $this->register('juan-legacy.p12')->assertCreated();

        $this->assertSame(1, SigningCertificate::active()->count());
        $this->assertNull(SigningCertificate::whereNotNull('removed_at')->sole()->encrypted_p12);

        $this->withToken($this->token)->deleteJson('/api/v1/me/pnpki-certificate')->assertOk();
        $this->assertSame(0, SigningCertificate::active()->count());
        $this->assertSame(0, SigningCertificate::whereNotNull('encrypted_p12')->count());
        $this->withToken($this->token)->postJson('/api/v1/me/pnpki-certificate/verify', ['password' => self::PASSWORD])->assertStatus(422);
    }

    public function test_names_match_despite_initials_case_and_order_of_detail(): void
    {
        $user = new User(['name' => 'Juan Dela Cruz', 'email' => 'juan@dost.gov.ph']);
        $match = fn (string $cn, string $email = '') => PnpkiCertificates::belongsTo(['subject_cn' => $cn, 'email' => $email], $user);

        $this->assertTrue($match('JUAN P. DELA CRUZ'));
        $this->assertTrue($match('juan dela cruz'));
        $this->assertTrue($match('SOMEONE ELSE', 'JUAN@dost.gov.ph'));
        $this->assertFalse($match('JUAN SANTOS'));
        $this->assertFalse($match('JUAN'));
    }

    public function test_nothing_works_while_pnpki_is_off(): void
    {
        config(['pnpki.enabled' => false]);
        $this->register('juan.p12')->assertForbidden();
    }

    public function test_a_missing_storage_key_says_the_server_is_not_set_up(): void
    {
        config(['pnpki.storage_key' => null]);
        $this->register('juan.p12')->assertStatus(503)->assertJsonPath('message', fn ($m) => str_contains($m, 'PNPKI_STORAGE_KEY'));
    }
}
