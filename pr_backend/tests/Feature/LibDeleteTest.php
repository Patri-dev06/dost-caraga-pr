<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\LibDocument;
use App\Models\Office;
use App\Models\PpmpDocument;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LibDeleteTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private function token(string $email): string
    {
        return $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'password123'])->json('token');
    }

    private function makeLib(User $owner, string $status = 'Draft'): LibDocument
    {
        $lib = new LibDocument();
        $lib->forceFill([
            'client_uid' => 'lib-'.uniqid(),
            'fiscal_year' => '2026',
            'project_title' => 'Test Project LIB',
            'status' => $status,
            'owner_id' => $owner->id,
            'owner_name' => $owner->name,
        ])->save();

        return $lib;
    }

    private function requester(): User
    {
        return User::where('email', 'mdelacruz@dost.gov.ph')->first();
    }

    public function test_the_owner_can_delete_their_own_draft_and_it_is_audited(): void
    {
        $lib = $this->makeLib($this->requester());

        $this->withToken($this->token('mdelacruz@dost.gov.ph'))->deleteJson("/api/v1/planning-libs/{$lib->client_uid}")->assertOk();

        $this->assertDatabaseMissing('lib_documents', ['id' => $lib->id]);
        $this->assertTrue(AuditLog::where('action', 'Deleted LIB')->where('target', 'like', '%Test Project LIB%')->exists());
    }

    public function test_someone_elses_lib_cannot_be_deleted(): void
    {
        $lib = $this->makeLib($this->requester());
        $other = User::create([
            'name' => 'Other', 'email' => 'other@dost.gov.ph', 'password' => Hash::make('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['lib'],
        ]);

        $this->withToken($this->token($other->email))->deleteJson("/api/v1/planning-libs/{$lib->client_uid}")->assertStatus(403);
        $this->assertDatabaseHas('lib_documents', ['id' => $lib->id]);
    }

    public function test_a_submitted_or_approved_lib_cannot_be_deleted_by_its_owner(): void
    {
        foreach (['Pending Supervisor Review', 'Forwarded to Budget Officer', 'Pending Regional Director Approval', 'Approved'] as $status) {
            $lib = $this->makeLib($this->requester(), $status);

            $this->withToken($this->token('mdelacruz@dost.gov.ph'))->deleteJson("/api/v1/planning-libs/{$lib->client_uid}")->assertStatus(403);
            $this->assertDatabaseHas('lib_documents', ['id' => $lib->id]);
        }
    }

    public function test_only_a_superadmin_can_delete_an_approved_lib(): void
    {
        $lib = $this->makeLib($this->requester(), 'Approved');

        // Admin tier is not enough.
        $this->withToken($this->token('admin@dost.gov.ph'))->deleteJson("/api/v1/planning-libs/{$lib->client_uid}")->assertStatus(403);
        $this->assertDatabaseHas('lib_documents', ['id' => $lib->id]);

        $this->withToken($this->token('superadmin@dost.gov.ph'))->deleteJson("/api/v1/planning-libs/{$lib->client_uid}")->assertOk();
        $this->assertDatabaseMissing('lib_documents', ['id' => $lib->id]);
    }

    public function test_a_lib_with_a_linked_ppmp_cannot_be_deleted_by_anyone(): void
    {
        $lib = $this->makeLib($this->requester());
        $ppmp = new PpmpDocument();
        $ppmp->forceFill([
            'project_id' => Project::first()->id,
            'lib_document_id' => $lib->id,
            'fiscal_year' => 2026,
            'status' => 'Draft',
        ])->save();

        $this->withToken($this->token('mdelacruz@dost.gov.ph'))->deleteJson("/api/v1/planning-libs/{$lib->client_uid}")
            ->assertStatus(422)->assertJsonPath('message', "This LIB is linked to 1 PPMP document(s) and can't be deleted.");
        $this->withToken($this->token('superadmin@dost.gov.ph'))->deleteJson("/api/v1/planning-libs/{$lib->client_uid}")->assertStatus(422);

        $this->assertDatabaseHas('lib_documents', ['id' => $lib->id]);
        $this->assertSame($lib->id, $ppmp->fresh()->lib_document_id);
    }
}
