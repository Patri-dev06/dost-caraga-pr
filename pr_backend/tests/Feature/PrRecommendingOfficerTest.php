<?php

namespace Tests\Feature;

use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** A submitted PR goes to the recommending officer named on it — not to every Recommender. */
class PrRecommendingOfficerTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    private function recommender(string $name): User
    {
        $user = User::create([
            'name' => $name, 'email' => str($name)->slug().'@dost.gov.ph', 'password' => bcrypt('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr', 'approvals'],
            'signature' => 'data:image/png;base64,iVBORw0KGgo=',
        ]);
        $user->roles()->sync([Role::where('name', 'Recommender')->value('id')]);

        return $user;
    }

    private function token(string $email): string
    {
        return $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'password123'])->json('token');
    }

    private function submitPr(string $token, ?int $officerId): \Illuminate\Testing\TestResponse
    {
        return $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO', 'fund_source' => 'GAA 2026 - MOOE', 'mode_of_procurement' => 'Shopping',
            'purpose' => 'Routing test.', 'submit' => true,
            'recommending_officer_id' => $officerId, 'recommending_designation' => 'Chief, FAD', 'approving_designation' => 'Regional Director',
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ]);
    }

    private function inboxIds(string $token): array
    {
        return collect($this->withToken($token)->getJson('/api/v1/approvals?per_page=100')->assertOk()->json('data'))->pluck('id')->all();
    }

    public function test_only_the_named_recommending_officer_is_notified_sees_it_and_may_recommend_it(): void
    {
        $chosen = $this->recommender('Chosen Officer');
        $other = $this->recommender('Other Officer');
        $admin = $this->token('admin@dost.gov.ph');

        $prId = $this->submitPr($admin, $chosen->id)->assertCreated()
            ->assertJsonPath('data.recommending_officer.name', 'Chosen Officer')
            ->assertJsonPath('data.recommending_designation', 'Chief, FAD')
            ->json('data.id');

        $this->assertTrue(UserNotification::where('user_id', $chosen->id)->where('type', 'pr_submitted')->exists());
        $this->assertFalse(UserNotification::where('user_id', $other->id)->where('type', 'pr_submitted')->exists());

        $chosenToken = $this->token($chosen->email);
        $otherToken = $this->token($other->email);
        $this->assertContains($prId, $this->inboxIds($chosenToken));
        $this->assertNotContains($prId, $this->inboxIds($otherToken));

        $this->withToken($otherToken)->postJson("/api/v1/approvals/{$prId}/recommend")->assertForbidden()
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Chosen Officer'));
        $this->withToken($chosenToken)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();

        // Recommended, it moves to the Regional Director's inbox and out of the officer's.
        $this->assertNotContains($prId, $this->inboxIds($chosenToken));
        $this->assertContains($prId, $this->inboxIds($admin)); // the seeded admin is the designated Regional Director
        $progress = $this->withToken($admin)->getJson("/api/v1/purchase-requests/{$prId}/progress")->json('data');
        $this->assertSame('approved', collect($progress['steps'])->firstWhere('status', 'current')['key']);
    }

    public function test_the_recommending_officer_must_hold_the_recommender_role(): void
    {
        $plain = User::create([
            'name' => 'Not A Recommender', 'email' => 'not-recommender@dost.gov.ph', 'password' => bcrypt('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr'],
        ]);

        $this->submitPr($this->token('admin@dost.gov.ph'), $plain->id)->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Recommender role'));
    }

    public function test_the_next_step_names_the_officer_it_waits_on(): void
    {
        $chosen = $this->recommender('Chosen Officer');
        $admin = $this->token('admin@dost.gov.ph');
        $prId = $this->submitPr($admin, $chosen->id)->json('data.id');

        $this->withToken($admin)->getJson("/api/v1/purchase-requests/{$prId}/progress")
            ->assertJsonPath('data.next.waiting_on', 'Chosen Officer');
    }
}
