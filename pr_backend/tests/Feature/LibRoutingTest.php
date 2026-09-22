<?php

namespace Tests\Feature;

use App\Models\LibDocument;
use App\Models\Office;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LibRoutingTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    private function token(string $email): string
    {
        return $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'password123'])->json('token');
    }

    private function makeUser(string $email, array $modules = ['lib'], string $name = 'Someone'): User
    {
        return User::create([
            'name' => $name, 'email' => $email, 'password' => Hash::make('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular',
            'modules' => $modules, 'signature' => self::SIGNATURE,
        ]);
    }

    /** A Draft LIB owned by Maria (who needs an e-signature to submit it). */
    private function makeLib(array $attributes = []): LibDocument
    {
        $owner = User::where('email', 'mdelacruz@dost.gov.ph')->first();
        $owner->update(['signature' => self::SIGNATURE]);

        $lib = new LibDocument();
        $lib->forceFill($attributes + [
            'client_uid' => 'lib-'.uniqid(),
            'fiscal_year' => '2026',
            'project_title' => 'Routing Test LIB',
            'status' => 'Draft',
            'owner_id' => $owner->id,
            'owner_name' => $owner->name,
        ])->save();

        return $lib;
    }

    private function submit(LibDocument $lib)
    {
        return $this->withToken($this->token('mdelacruz@dost.gov.ph'))->postJson("/api/v1/planning-libs/{$lib->client_uid}/submit");
    }

    public function test_a_submitted_lib_goes_to_the_picked_recommending_approval_and_only_they_are_notified(): void
    {
        $picked = $this->makeUser('picked@dost.gov.ph', name: 'Picked Recommender');
        $bystander = $this->makeUser('bystander@dost.gov.ph', name: 'Bystander');
        $lib = $this->makeLib(['recommending_user_id' => $picked->id]);

        $this->submit($lib)->assertOk()
            ->assertJsonPath('data.status', 'Pending Supervisor Review')
            ->assertJsonPath('data.supervisorId', $picked->id);

        $this->assertDatabaseHas('user_notifications', ['user_id' => $picked->id, 'type' => 'lib_submitted']);
        $this->assertSame(0, UserNotification::where('user_id', $bystander->id)->count());
    }

    public function test_submitting_needs_a_recommending_approval_to_be_picked(): void
    {
        $lib = $this->makeLib();

        $this->submit($lib)->assertStatus(422);
        $this->assertSame('Draft', $lib->fresh()->status);
    }

    public function test_you_cannot_be_your_own_recommending_approval(): void
    {
        $maria = User::where('email', 'mdelacruz@dost.gov.ph')->first();
        $lib = $this->makeLib(['recommending_user_id' => $maria->id]);

        $this->submit($lib)->assertStatus(422);
        $this->assertSame('Draft', $lib->fresh()->status);
    }

    public function test_the_recommending_approval_must_be_able_to_open_lib(): void
    {
        $noLib = $this->makeUser('nolib@dost.gov.ph', ['pr'], 'No Lib Access');
        $lib = $this->makeLib(['recommending_user_id' => $noLib->id]);

        $this->submit($lib)->assertStatus(422);
    }

    public function test_a_draft_saved_with_only_a_name_resolves_by_exact_name(): void
    {
        $picked = $this->makeUser('named@dost.gov.ph', name: 'Unique Named Person');
        $lib = $this->makeLib(['recommending_name' => 'Unique Named Person']);

        $this->submit($lib)->assertOk()->assertJsonPath('data.supervisorId', $picked->id);
        $this->assertSame($picked->id, $lib->fresh()->recommending_user_id);
    }

    public function test_an_ambiguous_name_is_not_guessed(): void
    {
        $this->makeUser('twin1@dost.gov.ph', name: 'Same Name');
        $this->makeUser('twin2@dost.gov.ph', name: 'Same Name');
        $lib = $this->makeLib(['recommending_name' => 'Same Name']);

        $this->submit($lib)->assertStatus(422);
    }

    public function test_only_the_picked_recommending_approval_can_recommend(): void
    {
        $picked = $this->makeUser('picked2@dost.gov.ph', name: 'Picked Two');
        $other = $this->makeUser('other@dost.gov.ph', name: 'Other Reviewer');
        $lib = $this->makeLib(['recommending_user_id' => $picked->id]);
        $this->submit($lib)->assertOk();

        $this->withToken($this->token($other->email))->postJson("/api/v1/planning-libs/{$lib->client_uid}/recommend")->assertStatus(403);
        $this->assertSame('Pending Supervisor Review', $lib->fresh()->status);

        $this->withToken($this->token($picked->email))->postJson("/api/v1/planning-libs/{$lib->client_uid}/recommend")
            ->assertOk()->assertJsonPath('data.status', 'Forwarded to Budget Officer');
    }

    public function test_the_recommending_approval_is_saved_with_the_lib_and_returned(): void
    {
        $picked = $this->makeUser('saved@dost.gov.ph', name: 'Saved Pick');
        $maria = $this->token('mdelacruz@dost.gov.ph');

        $this->withToken($maria)->postJson('/api/v1/planning-libs', [
            'id' => 'lib-saved-1',
            'fiscalYear' => '2026',
            'status' => 'Draft',
            'recommendingName' => 'Saved Pick',
            'recommendingPosition' => 'Chief',
            'recommendingId' => $picked->id,
            'rows' => [['id' => 'r1', 'label' => 'Travel', 'indent' => 0, 'header' => false, 'approved' => '100']],
        ])->assertSuccessful()->assertJsonPath('data.recommendingId', $picked->id);

        $this->assertSame($picked->id, LibDocument::where('client_uid', 'lib-saved-1')->value('recommending_user_id'));
    }

    public function test_the_single_supervisor_setting_no_longer_exists(): void
    {
        $superadmin = $this->token('superadmin@dost.gov.ph');

        $this->withToken($superadmin)->getJson('/api/v1/system-settings')->assertOk()->assertJsonMissing(['key' => 'supervisor_user_id']);
        $this->withToken($superadmin)->getJson('/api/v1/workflow-signatories')->assertOk()->assertJsonMissingPath('data.supervisor');
        $this->assertDatabaseMissing('system_preferences', ['key' => 'supervisor_user_id']);
    }
}
