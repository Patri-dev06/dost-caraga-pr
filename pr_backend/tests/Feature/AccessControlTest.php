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

    // --- 2. Deactivated users / token revocation ---

    public function test_a_deactivated_users_existing_token_stops_working(): void
    {
        $user = $this->makeRequester('leaver@dost.gov.ph');
        $token = $this->tokenFor($user->email);
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk();

        $user->forceFill(['status' => 'Deactivated'])->save();

        $this->withToken($token)->getJson('/api/v1/auth/me')->assertStatus(401)->assertJsonPath('code', 'account_inactive');
    }

    public function test_deactivating_via_the_api_revokes_all_tokens(): void
    {
        $user = $this->makeRequester('leaver2@dost.gov.ph');
        $this->tokenFor($user->email);
        $this->tokenFor($user->email);
        $this->assertSame(2, ApiToken::where('user_id', $user->id)->count());

        $superadmin = $this->tokenFor('superadmin@dost.gov.ph');
        $this->withToken($superadmin)->deleteJson("/api/v1/users/{$user->id}")->assertOk();

        $this->assertSame(0, ApiToken::where('user_id', $user->id)->count());
        $this->login($user->email)->assertStatus(422);
    }

    public function test_changing_a_password_revokes_existing_tokens(): void
    {
        $user = $this->makeRequester('pw@dost.gov.ph');
        $old = $this->tokenFor($user->email);
        $superadmin = $this->tokenFor('superadmin@dost.gov.ph');

        $this->withToken($superadmin)->putJson("/api/v1/users/{$user->id}", ['password' => 'a-brand-new-password'])->assertOk();

        $this->withToken($old)->getJson('/api/v1/auth/me')->assertStatus(401);
        $this->login($user->email, 'a-brand-new-password')->assertOk();
    }

    public function test_editing_a_user_without_touching_status_or_password_keeps_sessions(): void
    {
        $user = $this->makeRequester('keep@dost.gov.ph');
        $token = $this->tokenFor($user->email);
        $superadmin = $this->tokenFor('superadmin@dost.gov.ph');

        $this->withToken($superadmin)->putJson("/api/v1/users/{$user->id}", ['name' => 'Renamed'])->assertOk();

        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk();
    }

    public function test_user_status_only_accepts_known_values(): void
    {
        $user = $this->makeRequester('status@dost.gov.ph');
        $superadmin = $this->tokenFor('superadmin@dost.gov.ph');

        $this->withToken($superadmin)->putJson("/api/v1/users/{$user->id}", ['status' => 'Whatever'])->assertStatus(422);
    }

    // --- 3. PR ownership and visibility (Option A) ---

    public function test_a_requester_only_sees_and_opens_their_own_prs(): void
    {
        $alice = $this->makeRequester('alice@dost.gov.ph');
        $bob = $this->makeRequester('bob@dost.gov.ph');
        $aliceToken = $this->tokenFor($alice->email);
        $bobToken = $this->tokenFor($bob->email);

        $alicePr = $this->withToken($aliceToken)->postJson('/api/v1/purchase-requests', $this->prPayload())->assertCreated()->json('data.id');
        $bobPr = $this->withToken($bobToken)->postJson('/api/v1/purchase-requests', $this->prPayload())->assertCreated()->json('data.id');

        $ids = collect($this->withToken($aliceToken)->getJson('/api/v1/purchase-requests')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($alicePr));
        $this->assertFalse($ids->contains($bobPr));

        $this->withToken($aliceToken)->getJson("/api/v1/purchase-requests/{$alicePr}")->assertOk();
        $this->withToken($aliceToken)->getJson("/api/v1/purchase-requests/{$bobPr}")->assertNotFound();
    }

    public function test_a_requester_cannot_edit_validate_or_submit_someone_elses_pr(): void
    {
        $alice = $this->makeRequester('alice2@dost.gov.ph');
        $bob = $this->makeRequester('bob2@dost.gov.ph');
        $aliceToken = $this->tokenFor($alice->email);
        $bobToken = $this->tokenFor($bob->email);

        $bobPr = $this->withToken($bobToken)->postJson('/api/v1/purchase-requests', $this->prPayload())->assertCreated()->json('data.id');

        $this->withToken($aliceToken)->putJson("/api/v1/purchase-requests/{$bobPr}", ['purpose' => 'Hijacked'] + $this->prPayload())->assertNotFound();
        $this->withToken($aliceToken)->postJson("/api/v1/purchase-requests/{$bobPr}/validate")->assertNotFound();
        $this->withToken($aliceToken)->postJson("/api/v1/purchase-requests/{$bobPr}/submit")->assertNotFound();

        $pr = PurchaseRequest::find($bobPr);
        $this->assertSame('Draft', $pr->status);
        $this->assertSame('Ownership tests.', $pr->purpose);

        // The owner can still edit and submit.
        $this->withToken($bobToken)->postJson("/api/v1/purchase-requests/{$bobPr}/submit")->assertOk();
    }

    public function test_a_requester_cannot_file_a_pr_in_someone_elses_name(): void
    {
        $alice = $this->makeRequester('alice3@dost.gov.ph');
        $bob = $this->makeRequester('bob3@dost.gov.ph');

        $prId = $this->withToken($this->tokenFor($alice->email))
            ->postJson('/api/v1/purchase-requests', $this->prPayload() + ['requestedBy' => $bob->id])
            ->assertCreated()->json('data.id');

        $this->assertSame($alice->id, PurchaseRequest::find($prId)->requested_by);
    }

    public function test_admin_can_file_on_behalf_and_sees_every_pr(): void
    {
        $alice = $this->makeRequester('alice4@dost.gov.ph');
        $aliceToken = $this->tokenFor($alice->email);
        $alicePr = $this->withToken($aliceToken)->postJson('/api/v1/purchase-requests', $this->prPayload())->assertCreated()->json('data.id');

        $admin = $this->tokenFor('admin@dost.gov.ph');
        $this->withToken($admin)->getJson("/api/v1/purchase-requests/{$alicePr}")->assertOk();
        $this->withToken($admin)->putJson("/api/v1/purchase-requests/{$alicePr}", ['purpose' => 'Admin edit'] + $this->prPayload())->assertOk();

        $onBehalf = $this->withToken($admin)
            ->postJson('/api/v1/purchase-requests', $this->prPayload() + ['requestedBy' => $alice->id])
            ->assertCreated()->json('data.id');
        $this->assertSame($alice->id, PurchaseRequest::find($onBehalf)->requested_by);
    }

    public function test_holders_of_cross_cutting_modules_see_every_pr(): void
    {
        $alice = $this->makeRequester('alice5@dost.gov.ph');
        $alicePr = $this->withToken($this->tokenFor($alice->email))
            ->postJson('/api/v1/purchase-requests', $this->prPayload())->assertCreated()->json('data.id');

        foreach (['approvals', 'rfq', 'po', 'validation'] as $module) {
            $viewer = $this->makeRequester("viewer-{$module}@dost.gov.ph", ['pr', $module]);
            $token = $this->tokenFor($viewer->email);

            $ids = collect($this->withToken($token)->getJson('/api/v1/purchase-requests')->assertOk()->json('data'))->pluck('id');
            $this->assertTrue($ids->contains($alicePr), "{$module} holder should see every PR");
            $this->withToken($token)->getJson("/api/v1/purchase-requests/{$alicePr}")->assertOk();
        }
    }

    public function test_usage_endpoint_gives_requesters_shared_totals_without_pr_details(): void
    {
        $alice = $this->makeRequester('alice6@dost.gov.ph');
        $bob = $this->makeRequester('bob6@dost.gov.ph');
        $this->withToken($this->tokenFor($bob->email))->postJson('/api/v1/purchase-requests', $this->prPayload())->assertCreated();

        $response = $this->withToken($this->tokenFor($alice->email))->getJson('/api/v1/purchase-requests/usage')->assertOk();

        $this->assertNotEmpty($response->json('data'));
        $row = $response->json('data.0');
        // Pre-summed per item (name/uom/quantity/amount) — no requester, purpose, PR id, or per-PR detail leaks through.
        $this->assertSame(['name', 'uom', 'quantity', 'amount'], array_keys($row));
    }

    public function test_usage_endpoint_can_be_scoped_to_one_fund_source_and_exclude_a_draft(): void
    {
        $token = $this->tokenFor('mdelacruz@dost.gov.ph');
        $prId = $this->withToken($token)->postJson('/api/v1/purchase-requests', $this->prPayload())->assertCreated()->json('data.id');

        $usageUrl = fn (array $params) => '/api/v1/purchase-requests/usage?'.http_build_query($params);
        $hasItem = fn ($response, string $name) => collect($response->json('data'))->contains(fn ($row) => $row['name'] === $name);

        // GAA already carries the seeded demo PR's items — excluding THIS PR only drops its own item.
        $withSelf = $this->withToken($token)->getJson($usageUrl(['fund_source' => 'GAA 2026 - MOOE']))->assertOk();
        $this->assertTrue($hasItem($withSelf, 'A4-sized Bond Paper'));

        $withoutSelf = $this->withToken($token)
            ->getJson($usageUrl(['fund_source' => 'GAA 2026 - MOOE', 'exclude_pr_id' => $prId]))->assertOk();
        $this->assertFalse($hasItem($withoutSelf, 'A4-sized Bond Paper'));

        $otherFund = $this->withToken($token)->getJson($usageUrl(['fund_source' => 'Trust Fund - SETUP']))->assertOk();
        $this->assertEmpty($otherFund->json('data'));
    }

    public function test_mine_filter_returns_only_prs_the_user_themselves_filed(): void
    {
        $alice = $this->makeRequester('alice7@dost.gov.ph');
        $aliceToken = $this->tokenFor($alice->email);
        $alicePr = $this->withToken($aliceToken)->postJson('/api/v1/purchase-requests', $this->prPayload())->assertCreated()->json('data.id');

        $admin = $this->tokenFor('admin@dost.gov.ph');
        $onBehalf = $this->withToken($admin)
            ->postJson('/api/v1/purchase-requests', $this->prPayload() + ['requestedBy' => $alice->id])
            ->assertCreated()->json('data.id');

        // Admin sees every PR by default, but "mine" narrows it to only what admin themselves filed —
        // none of Alice's, even the one admin filed on her behalf.
        $ids = collect($this->withToken($admin)->getJson('/api/v1/purchase-requests?mine=1')->assertOk()->json('data'))->pluck('id');
        $this->assertFalse($ids->contains($alicePr));
        $this->assertFalse($ids->contains($onBehalf));
    }

    public function test_mine_filter_paginates_properly_instead_of_returning_everything(): void
    {
        $alice = $this->makeRequester('alice8@dost.gov.ph');
        $token = $this->tokenFor($alice->email);
        foreach (range(1, 3) as $n) {
            $this->withToken($token)->postJson('/api/v1/purchase-requests', $this->prPayload())->assertCreated();
        }

        $page1 = $this->withToken($token)->getJson('/api/v1/purchase-requests?mine=1&per_page=2')->assertOk();
        $page1->assertJsonCount(2, 'data')->assertJsonPath('total', 3)->assertJsonPath('last_page', 2);

        $page2 = $this->withToken($token)->getJson('/api/v1/purchase-requests?mine=1&per_page=2&page=2')->assertOk();
        $page2->assertJsonCount(1, 'data');
    }

    public function test_approvals_limit_caps_the_query_instead_of_the_whole_queue(): void
    {
        $token = $this->tokenFor('admin@dost.gov.ph');
        foreach (range(1, 3) as $n) {
            $this->withToken($token)->postJson('/api/v1/purchase-requests', $this->prPayload() + ['submit' => true])->assertCreated();
        }

        $this->withToken($token)->getJson('/api/v1/approvals?limit=2')->assertOk()->assertJsonCount(2, 'data');
        $this->withToken($token)->getJson('/api/v1/approvals')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_the_lib_list_can_be_filtered_by_status(): void
    {
        $token = $this->tokenFor('admin@dost.gov.ph');

        $draft = $this->withToken($token)->postJson('/api/v1/planning-libs', [
            'id' => 'lib-status-draft', 'fiscalYear' => '2026', 'status' => 'Draft',
            'rows' => [['id' => 'r1', 'label' => 'Travel', 'indent' => 0, 'header' => false, 'approved' => '100']],
        ])->assertSuccessful();

        $response = $this->withToken($token)->getJson('/api/v1/planning-libs?status=Draft')->assertOk();
        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($draft->json('data.id')));

        $response = $this->withToken($token)->getJson('/api/v1/planning-libs?status=Approved')->assertOk();
        $ids = collect($response->json('data'))->pluck('id');
        $this->assertFalse($ids->contains($draft->json('data.id')));
    }
}
