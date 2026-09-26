<?php

namespace Tests\Feature;

use App\Models\Office;
use App\Models\Role;
use App\Models\SystemPreference;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Officers designated in Settings must hold the matching role, and keep it while designated. */
class SettingsRoleLinkTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        // Only an Admin-role account may change Settings; the seeded superadmin holds it.
        $this->token = $this->postJson('/api/v1/auth/login', ['email' => 'superadmin@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    private function user(string $name, array $roles = []): User
    {
        $user = User::create([
            'name' => $name, 'email' => str($name)->slug().'@dost.gov.ph', 'password' => bcrypt('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr'],
        ]);
        $user->roles()->sync(Role::whereIn('name', $roles)->pluck('id'));

        return $user;
    }

    private function designate(string $key, int $userId): \Illuminate\Testing\TestResponse
    {
        return $this->withToken($this->token)->putJson('/api/v1/system-settings', ['settings' => [['key' => $key, 'value' => (string) $userId]]]);
    }

    public function test_an_officer_can_only_be_designated_if_they_hold_the_role(): void
    {
        $plain = $this->user('Plain Staff');
        $chair = $this->user('Chair Person', ['BAC Chairman', 'Recommender']);

        $this->designate('bac_chair_user_id', $plain->id)->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'BAC Chairman role'));
        $this->designate('bac_chair_user_id', $chair->id)->assertOk();
        $this->assertEquals($chair->id, SystemPreference::where('key', 'bac_chair_user_id')->first()->value['value']);

        // The Supply Officer post has its own role now.
        $supply = $this->user('Supply Person', ['Supply Officer']);
        $this->designate('supply_officer_user_id', $supply->id)->assertOk();
        $this->designate('supply_officer_user_id', $chair->id)->assertStatus(422);

        // Posts without a role (e.g. Budget Officer) are unaffected.
        $this->designate('budget_officer_user_id', $plain->id)->assertOk();
    }

    public function test_settings_tell_the_picker_which_role_each_post_needs(): void
    {
        $settings = collect($this->withToken($this->token)->getJson('/api/v1/system-settings')->assertOk()->json('data'))->keyBy('key');

        $this->assertSame('Regional Director', $settings['regional_director_user_id']['required_role']);
        $this->assertSame('BAC Vice-Chairman', $settings['bac_vice_chair_user_id']['required_role']);
        $this->assertNull($settings['budget_officer_user_id']['required_role']);
    }

    public function test_a_designated_officer_keeps_the_role_until_someone_else_is_designated(): void
    {
        $director = $this->user('Director One', ['Regional Director']);
        $this->designate('regional_director_user_id', $director->id)->assertOk();

        $this->withToken($this->token)->putJson("/api/v1/users/{$director->id}", ['role_ids' => []])->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'designated Regional Director'));

        // Other role changes on them are fine, as long as they keep the designated one.
        $this->withToken($this->token)->putJson("/api/v1/users/{$director->id}", [
            'role_ids' => Role::whereIn('name', ['Regional Director', 'Approver'])->pluck('id')->all(),
        ])->assertOk();

        // The seeded admin is designated everywhere by default without these roles — its roles stay editable.
        $admin = User::where('email', 'admin@dost.gov.ph')->first();
        $this->withToken($this->token)->putJson("/api/v1/users/{$admin->id}", ['role_ids' => $admin->roles->pluck('id')->push(Role::where('name', 'Supply Officer')->value('id'))->all()])->assertOk();
    }
}
