<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileUpdateTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private function loginAsAdmin(): string
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        return $login->json('token');
    }

    public function test_user_can_update_own_name_email_and_position(): void
    {
        $token = $this->loginAsAdmin();

        $this->withToken($token)
            ->putJson('/api/v1/auth/me', [
                'name' => 'Updated Admin Name',
                'email' => 'updated-admin@dost.gov.ph',
                'position' => 'Senior Administrator',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Admin Name')
            ->assertJsonPath('data.email', 'updated-admin@dost.gov.ph')
            ->assertJsonPath('data.position', 'Senior Administrator');

        $this->assertDatabaseHas('users', [
            'email' => 'updated-admin@dost.gov.ph',
            'name' => 'Updated Admin Name',
            'position' => 'Senior Administrator',
        ]);
    }

    public function test_update_rejects_email_already_used_by_another_account(): void
    {
        $token = $this->loginAsAdmin();

        $this->withToken($token)
            ->putJson('/api/v1/auth/me', [
                'email' => 'mdelacruz@dost.gov.ph',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_update_allows_keeping_own_unchanged_email(): void
    {
        $token = $this->loginAsAdmin();

        $this->withToken($token)
            ->putJson('/api/v1/auth/me', [
                'email' => 'admin@dost.gov.ph',
                'position' => 'Administrator',
            ])
            ->assertOk()
            ->assertJsonPath('data.email', 'admin@dost.gov.ph')
            ->assertJsonPath('data.position', 'Administrator');
    }

    public function test_update_cannot_change_tier_status_or_modules(): void
    {
        $token = $this->loginAsAdmin();

        $this->withToken($token)
            ->putJson('/api/v1/auth/me', [
                'name' => 'Still Admin',
                'tier' => 'superadmin',
                'status' => 'Suspended',
                'modules' => ['everything'],
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Still Admin');

        $this->assertDatabaseHas('users', [
            'name' => 'Still Admin',
            'status' => 'Active',
        ]);

        $this->assertDatabaseMissing('users', [
            'name' => 'Still Admin',
            'tier' => 'superadmin',
        ]);
    }

    public function test_update_requires_authentication(): void
    {
        $this->putJson('/api/v1/auth/me', [
            'name' => 'Nobody',
        ])->assertUnauthorized();
    }

    public function test_update_writes_an_audit_log_entry(): void
    {
        $token = $this->loginAsAdmin();

        $this->withToken($token)
            ->putJson('/api/v1/auth/me', [
                'position' => 'Audited Position',
            ])
            ->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'module' => 'Account',
            'action' => 'Updated Profile',
            'target' => 'admin@dost.gov.ph',
        ]);
    }
}
