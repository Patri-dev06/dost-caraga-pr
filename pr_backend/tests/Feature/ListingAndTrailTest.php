<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Office;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** The PR's real approval trail, server-side searches and filters, and capped page sizes. */
class ListingAndTrailTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->token = $this->postJson('/api/v1/auth/login', ['email' => 'superadmin@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    private function pr(string $token, string $purpose = 'Listing test.'): int
    {
        return $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO', 'fund_source' => 'GAA 2026 - MOOE', 'mode_of_procurement' => 'Shopping',
            'purpose' => $purpose, 'submit' => true,
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ])->assertCreated()->json('data.id');
    }

    public function test_a_pr_carries_its_real_approval_trail_with_who_acted(): void
    {
        $admin = $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->json('token');
        $prId = $this->pr($admin);
        $this->withToken($admin)->postJson("/api/v1/approvals/{$prId}/recommend", ['remarks' => 'Endorsed.'])->assertOk();

        $trail = $this->withToken($admin)->getJson("/api/v1/purchase-requests/{$prId}")->assertOk()->json('data.approval_trail');

        $this->assertSame(['Submitted PR', 'Recommended'], array_column($trail, 'action'));
        $this->assertSame('Supply Unit Admin', $trail[1]['actor']);
        $this->assertSame('Endorsed.', $trail[1]['remarks']);
        $this->assertNotNull($trail[1]['created_at']);
    }

    public function test_monitoring_filters_one_requesters_prs(): void
    {
        $maria = User::create([
            'name' => 'Maria Lists', 'email' => 'lists-maria@dost.gov.ph', 'password' => bcrypt('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr'],
        ]);
        $mariaPr = $this->pr($this->postJson('/api/v1/auth/login', ['email' => $maria->email, 'password' => 'password123'])->json('token'));
        $this->pr($this->token);

        $ids = collect($this->withToken($this->token)->getJson("/api/v1/purchase-requests/monitoring?requested_by={$maria->id}")->assertOk()->json('data'))->pluck('pr_id');

        $this->assertSame([$mariaPr], $ids->all());
    }

    public function test_page_sizes_are_capped_at_100(): void
    {
        $this->withToken($this->token)->getJson('/api/v1/purchase-requests?per_page=100000')->assertOk()->assertJsonPath('per_page', 100);
        $this->withToken($this->token)->getJson('/api/v1/audit-logs?per_page=100000')->assertOk()->assertJsonPath('per_page', 100);
    }

    public function test_audit_logs_filter_by_search_module_and_period(): void
    {
        AuditLog::create(['actor_name' => 'Old Actor', 'module' => 'PPMP', 'action' => 'Saved PPMP Document', 'target' => 'ppmp-old', 'created_at' => now()->subDays(40)]);
        AuditLog::create(['actor_name' => 'Recent Actor', 'module' => 'PPMP', 'action' => 'Saved PPMP Document', 'target' => 'ppmp-new', 'created_at' => now()->subDay()]);
        AuditLog::create(['actor_name' => 'Recent Actor', 'module' => 'RFQ', 'action' => 'Created RFQ', 'target' => 'RFQ-1', 'created_at' => now()]);

        $get = fn (array $q) => $this->withToken($this->token)->getJson('/api/v1/audit-logs?'.http_build_query($q + ['per_page' => 100]))->assertOk();

        $this->assertSame(['ppmp-new'], collect($get(['module' => 'PPMP', 'days' => 30])->json('data'))->pluck('target')->all());
        $this->assertSame(['RFQ-1'], collect($get(['search' => 'RFQ-1'])->json('data'))->pluck('target')->all());
        $this->assertContains('PPMP', $get([])->json('modules'));
    }

    public function test_rfqs_can_be_searched_by_rfq_or_pr_number(): void
    {
        // The seeded admin has an e-signature (signing needs one) and is the designated Regional Director.
        $this->token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->json('token');
        $prId = $this->pr($this->token);
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();
        $rfq = $this->withToken($this->token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'items' => [['description' => 'Bond paper', 'uom' => 'ream', 'quantity' => 1, 'unit_abc' => 250, 'total_abc' => 250]],
        ])->assertCreated()->json('data');
        $prNo = \App\Models\PurchaseRequest::find($prId)->pr_no;

        foreach ([$rfq['rfq_no'], $prNo] as $term) {
            $ids = collect($this->withToken($this->token)->getJson('/api/v1/rfqs?'.http_build_query(['search' => $term]))->assertOk()->json('data'))->pluck('id');
            $this->assertSame([$rfq['id']], $ids->all(), "Searching {$term}");
        }
        $this->assertSame([], $this->withToken($this->token)->getJson('/api/v1/rfqs?search=nothing-like-this')->json('data'));
    }
}
