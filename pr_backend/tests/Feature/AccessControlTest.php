<?php

namespace Tests\Feature;

use App\Models\ApiToken;
use App\Models\Office;
use App\Models\PurchaseRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private function login(string $email, string $password = 'password123')
    {
        return $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => $password]);
    }

    private function tokenFor(string $email): string
    {
        return $this->login($email)->json('token');
    }

    private function makeRequester(string $email, array $modules = ['pr']): User
    {
        return User::create([
            'name' => 'Requester '.$email,
            'email' => $email,
            'password' => Hash::make('password123'),
            'office_id' => Office::first()->id,
            'status' => 'Active',
            'tier' => 'regular',
            'modules' => $modules,
        ]);
    }

    private function prPayload(): array
    {
        return [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'project_code' => 'PROJ-2026-001',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Ownership tests.',
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ];
    }

    // --- 1. Rate limiting ---

    public function test_login_is_throttled_after_repeated_failures(): void
    {
        config(['auth.throttle_enabled' => true, 'auth.login_attempts_per_minute' => 3]);

        for ($i = 0; $i < 3; $i++) {
            $this->login('admin@dost.gov.ph', 'wrong-password')->assertStatus(422);
        }

        $this->login('admin@dost.gov.ph', 'wrong-password')->assertStatus(429);
        // Even the right password is refused while the limit is active for this email + IP.
        $this->login('admin@dost.gov.ph')->assertStatus(429);
    }

    public function test_one_accounts_lockout_does_not_block_other_accounts(): void
    {
        config(['auth.throttle_enabled' => true, 'auth.login_attempts_per_minute' => 2]);

        $this->login('admin@dost.gov.ph', 'wrong')->assertStatus(422);
        $this->login('admin@dost.gov.ph', 'wrong')->assertStatus(422);
        $this->login('admin@dost.gov.ph', 'wrong')->assertStatus(429);

        $this->login('mdelacruz@dost.gov.ph')->assertOk();
    }

    public function test_registration_is_throttled(): void
    {
        config(['auth.throttle_enabled' => true, 'auth.register_attempts_per_hour' => 2]);
        $office = Office::first();

        foreach (range(1, 3) as $n) {
            $response = $this->postJson('/api/v1/auth/register', [
                'name' => "Spammer {$n}", 'email' => "spam{$n}@example.com", 'password' => 'password123',
                'position' => 'X', 'office_id' => $office->id,
            ]);
            $n <= 2 ? $response->assertCreated() : $response->assertStatus(429);
        }
    }

}
