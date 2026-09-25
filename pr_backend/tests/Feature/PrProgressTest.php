<?php

namespace Tests\Feature;

use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** A PR's step-by-step progress, the requester's own list, and the fixed approval order. */
class PrProgressTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    private function pr(bool $submit = true, ?string $token = null): int
    {
        return $this->withToken($token ?? $this->token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO', 'fund_source' => 'GAA 2026 - MOOE', 'mode_of_procurement' => 'Shopping',
            'purpose' => 'Progress test.', 'submit' => $submit,
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ])->assertCreated()->json('data.id');
    }

    private function progress(int $prId): array
    {
        return $this->withToken($this->token)->getJson("/api/v1/purchase-requests/{$prId}/progress")->assertOk()->json('data');
    }

    private function current(int $prId): ?string
    {
        return collect($this->progress($prId)['steps'])->firstWhere('status', 'current')['key'] ?? null;
    }

    public function test_the_regional_director_signs_only_after_the_recommendation_and_rfq_only_after_both(): void
    {
        $prId = $this->pr();
        $rfq = fn () => $this->withToken($this->token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId, 'procurement_category' => 'Goods',
            'items' => [['description' => 'Bond paper', 'uom' => 'ream', 'quantity' => 1, 'unit_abc' => 250, 'total_abc' => 250]],
        ]);

        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/approve")->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'not been recommended'));
        $rfq()->assertStatus(422);

        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertStatus(422); // only once
        $rfq()->assertStatus(422);

        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();
        $rfq()->assertCreated();
    }

    public function test_progress_shows_what_is_done_what_is_next_and_what_is_missing(): void
    {
        $draft = $this->pr(submit: false);
        $this->assertSame('submitted', $this->current($draft));

        $prId = $this->pr();
        $progress = $this->progress($prId);
        $this->assertSame(1, $progress['done']);
        $this->assertSame('recommended', $this->current($prId));
        $this->assertSame('Recommending officer', $progress['next']['waiting_on']);
        $this->assertGreaterThan(10, collect($progress['steps'])->where('status', 'pending')->count()); // the missing steps

        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->assertSame('approved', $this->current($prId));
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();
        $this->assertSame('rfq_generated', $this->current($prId));

        // A rejected PR stops: nothing after it is "current" any more.
        $rejected = $this->pr();
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$rejected}/reject", ['reason' => 'Not in the plan.'])->assertOk();
        $stopped = $this->progress($rejected);
        $this->assertStringContainsString('Not in the plan', $stopped['stopped']);
        $this->assertNull($this->current($rejected));
    }

    public function test_my_submissions_lists_only_my_own_prs_with_their_next_step(): void
    {
        $maria = User::create([
            'name' => 'Maria Progress', 'email' => 'progress-maria@dost.gov.ph', 'password' => bcrypt('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr'],
        ]);
        $mariaToken = $this->postJson('/api/v1/auth/login', ['email' => $maria->email, 'password' => 'password123'])->json('token');
        $mine = $this->pr(token: $mariaToken);
        $adminPr = $this->pr();

        $rows = collect($this->withToken($mariaToken)->getJson('/api/v1/purchase-requests/my-submissions')->assertOk()->json('data'));
        $this->assertSame([$mine], $rows->pluck('id')->all());
        $this->assertSame('For Recommendation', $rows[0]['status']);
        $this->assertSame('Recommended', $rows[0]['progress']['next']['label']);

        // An admin sees every PR elsewhere, but "My Submissions" is only what they filed themselves.
        $adminRows = collect($this->withToken($this->token)->getJson('/api/v1/purchase-requests/my-submissions?per_page=50')->json('data'));
        $this->assertContains($adminPr, $adminRows->pluck('id')->all());
        $this->assertNotContains($mine, $adminRows->pluck('id')->all());

        // Someone else's PR's progress is not theirs to see.
        $this->withToken($mariaToken)->getJson("/api/v1/purchase-requests/{$adminPr}/progress")->assertNotFound();
    }

    public function test_an_rfq_cannot_add_items_beyond_the_purchase_request(): void
    {
        $prId = $this->pr();
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();
        $line = ['description' => 'Bond paper', 'uom' => 'ream', 'quantity' => 1, 'unit_abc' => 250, 'total_abc' => 250];

        $this->withToken($this->token)->postJson('/api/v1/rfqs', ['purchase_request_id' => $prId, 'items' => [$line, $line]])
            ->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'cannot be added'));
        $this->withToken($this->token)->postJson('/api/v1/rfqs', ['purchase_request_id' => $prId, 'items' => [$line]])->assertCreated();
    }
}
