<?php

namespace Tests\Feature;

use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Signatory roles: the BAC Chairman picker's role filter, and a single Regional Director. */
class SignatoryRolesTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private function token(string $email = 'superadmin@dost.gov.ph'): string
    {
        return $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'password123'])->json('token');
    }

    private function user(string $name, array $roles): User
    {
        $user = User::create([
            'name' => $name, 'email' => str($name)->slug().'@dost.gov.ph', 'password' => bcrypt('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr'],
        ]);
        $user->roles()->sync(Role::whereIn('name', $roles)->pluck('id'));

        return $user;
    }

    private function roleId(string $name): int
    {
        return Role::where('name', $name)->value('id');
    }

    public function test_the_bac_chairman_picker_lists_only_holders_of_that_role(): void
    {
        $this->user('Meriam Bouquia', ['BAC Chairman', 'Recommender']); // several roles at once
        $this->user('Pedro Vice', ['BAC Vice-Chairman']);
        $this->user('Ana Requester', ['Requester']);

        $listed = collect($this->withToken($this->token())->getJson('/api/v1/signatories?'.http_build_query(['role' => 'BAC Chairman']))->assertOk()->json('data'));

        $this->assertSame(['Meriam Bouquia'], $listed->pluck('name')->all());
        $this->assertEqualsCanonicalizing(['BAC Chairman', 'Recommender'], $listed->first()['roles']);
    }

    public function test_only_one_account_can_be_the_regional_director(): void
    {
        $director = $this->user('Director One', ['Regional Director']);
        $other = $this->user('Director Two', ['Requester']);
        $token = $this->token();

        $this->withToken($token)->putJson("/api/v1/users/{$other->id}", ['role_ids' => [$this->roleId('Regional Director')]])
            ->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'Director One'));
        $this->withToken($token)->postJson('/api/v1/users', [
            'name' => 'Director Three', 'email' => 'director3@dost.gov.ph', 'password' => 'password123',
            'role_ids' => [$this->roleId('Regional Director')],
        ])->assertStatus(422);

        // The holder keeps the role when their other roles change…
        $this->withToken($token)->putJson("/api/v1/users/{$director->id}", ['role_ids' => [$this->roleId('Regional Director'), $this->roleId('Approver')]])->assertOk();

        // …and once it is removed from them, someone else can take it.
        $this->withToken($token)->putJson("/api/v1/users/{$director->id}", ['role_ids' => [$this->roleId('Approver')]])->assertOk();
        $this->withToken($token)->putJson("/api/v1/users/{$other->id}", ['role_ids' => [$this->roleId('Regional Director')]])->assertOk();
        $this->assertSame(['Director Two'], User::whereHas('roles', fn ($q) => $q->where('name', 'Regional Director'))->pluck('name')->all());
    }
}
