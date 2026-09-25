<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Concerns\SignsRfq;
use Tests\TestCase;

class MonitoringSheetTest extends TestCase
{
    use RefreshDatabase;
    use SignsRfq;

    protected bool $seed = true;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function loginAsAdmin(): string
    {
        return $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ])->json('token');
    }

    private function createApprovedPr(string $token): int
    {
        $create = $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'project_code' => 'PROJ-2026-001',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Create a PR for the monitoring sheet test.',
            'submit' => true,
            'items' => [
                ['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250],
            ],
        ])->assertCreated();

        $prId = $create->json('data.id');
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();

        return $prId;
    }

    /** Full RFQ lifecycle through BAC approval and Supply noting the lowest bidder; returns the RFQ id. */
    private function createApprovedAoc(string $token, int $prId): int
    {
        [$rfqId] = $this->quotedRfq($token, $prId);
        $this->notedAoc($token, $rfqId);

        return $rfqId;
    }

    public function test_a_pr_with_no_rfq_yet_shows_a_row_with_the_later_columns_blank(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);

        $response = $this->withToken($token)->getJson('/api/v1/purchase-requests/monitoring')->assertOk();
        $row = collect($response->json('data'))->firstWhere('pr_id', $prId);

        $this->assertNotNull($row);
        $this->assertNotNull($row['pr_no']);
        $this->assertNotNull($row['date']);
        $this->assertEquals(250, $row['amount']);
        $this->assertNull($row['rfq_no']);
        $this->assertNull($row['aoc_out']);
        $this->assertNull($row['po_no']);
    }

    public function test_a_pr_taken_through_rfq_aoc_and_po_shows_every_phase_one_column(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedAoc($token, $prId);
        $poId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->json('data.id');

        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/submit")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/obligate")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/account")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/final-approve")->assertOk();

        $response = $this->withToken($token)->getJson('/api/v1/purchase-requests/monitoring')->assertOk();
        $row = collect($response->json('data'))->firstWhere('pr_id', $prId);

        $this->assertNotNull($row['rfq_no']);
        $this->assertNotNull($row['rfq_out_for_signature']);
        $this->assertNotNull($row['rfq_in_with_signature']);
        $this->assertNotNull($row['rfq_out']);
        $this->assertSame('Juan Dela Cruz', $row['quotation_routed_by']);
        $this->assertNotNull($row['in_with_quotation']);
        $this->assertStringContainsString('ACME Trading', $row['suppliers']);
        $this->assertNotNull($row['aoc_out']);
        $this->assertNotNull($row['aoc_in_with_signature']);
        $this->assertNotNull($row['bac_member_who_signed']);
        $this->assertNotEmpty($row['awarded_supplier']);
        $this->assertNotNull($row['po_no']);
        $this->assertGreaterThan(0, (float) $row['amount_awarded']);
        $this->assertNotNull($row['po_out_to_budget']);
        $this->assertStringStartsWith('Forwarded to supplier', (string) $row['po_remarks']);
        $this->assertNull($row['po_conformed_at']);
        $this->assertNotNull($row['po_approved_at']);
    }

    public function test_a_requester_only_sees_their_own_rows_on_the_monitoring_sheet(): void
    {
        $alice = \App\Models\User::create([
            'name' => 'Alice', 'email' => 'monitoring-alice@dost.gov.ph', 'password' => bcrypt('password123'),
            'office_id' => \App\Models\Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr'],
        ]);
        $aliceToken = $this->postJson('/api/v1/auth/login', ['email' => $alice->email, 'password' => 'password123'])->json('token');
        $adminToken = $this->loginAsAdmin();

        $adminPrId = $this->createApprovedPr($adminToken);

        $response = $this->withToken($aliceToken)->getJson('/api/v1/purchase-requests/monitoring')->assertOk();
        $ids = collect($response->json('data'))->pluck('pr_id');

        $this->assertFalse($ids->contains($adminPrId));
    }

    private function monitoringRow(string $token, int $prId, array $query = []): ?array
    {
        $url = '/api/v1/purchase-requests/monitoring?'.http_build_query($query + ['per_page' => 100]);

        return collect($this->withToken($token)->getJson($url)->assertOk()->json('data'))->firstWhere('pr_id', $prId);
    }

    public function test_supply_edits_the_hand_kept_columns_of_an_entry(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);

        $this->assertTrue($this->monitoringRow($token, $prId)['can_edit']);

        $this->withToken($token)->putJson("/api/v1/purchase-requests/{$prId}/monitoring", ['values' => [
            'ors_burs_no' => 'ORS-2026-09-0012',
            'ors_burs_at' => '2026-09-20T14:30',
            'delivery_term_days' => 15,
            'iar_no' => 'IAR-0042',
        ]])->assertOk()->assertJsonPath('data.manual.ors_burs_no', 'ORS-2026-09-0012');

        // A later save only touches the keys it sends; a blank one clears that cell.
        $this->withToken($token)->putJson("/api/v1/purchase-requests/{$prId}/monitoring", ['values' => [
            'delivered_full_at' => '2026-10-05',
            'iar_no' => '',
        ]])->assertOk();

        $manual = $this->monitoringRow($token, $prId)['manual'];
        $this->assertSame('ORS-2026-09-0012', $manual['ors_burs_no']);
        $this->assertSame('2026-09-20T14:30', $manual['ors_burs_at']);
        $this->assertEquals(15, $manual['delivery_term_days']);
        $this->assertSame('2026-10-05', $manual['delivered_full_at']);
        $this->assertArrayNotHasKey('iar_no', $manual);
    }

    public function test_an_entry_rejects_unknown_columns_and_badly_typed_values(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);

        $this->withToken($token)->putJson("/api/v1/purchase-requests/{$prId}/monitoring", ['values' => ['pr_no' => 'HACKED']])
            ->assertStatus(422);
        $this->withToken($token)->putJson("/api/v1/purchase-requests/{$prId}/monitoring", ['values' => ['delivered_full_at' => '10/05/2026']])
            ->assertStatus(422)->assertJsonValidationErrors('values.delivered_full_at');
        $this->withToken($token)->putJson("/api/v1/purchase-requests/{$prId}/monitoring", ['values' => ['delivery_term_days' => 'fifteen']])
            ->assertStatus(422)->assertJsonValidationErrors('values.delivery_term_days');

        $this->assertSame([], (array) $this->monitoringRow($token, $prId)['manual']);
    }

    public function test_a_requester_cannot_edit_monitoring_entries(): void
    {
        $alice = \App\Models\User::create([
            'name' => 'Alice', 'email' => 'monitoring-alice@dost.gov.ph', 'password' => bcrypt('password123'),
            'office_id' => \App\Models\Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr'],
        ]);
        $aliceToken = $this->postJson('/api/v1/auth/login', ['email' => $alice->email, 'password' => 'password123'])->json('token');
        // Alice's own PR, so she can see its row but still may not edit it.
        $prId = $this->createApprovedPr($this->loginAsAdmin());
        \App\Models\PurchaseRequest::whereKey($prId)->update(['requested_by' => $alice->id]);

        $this->assertFalse($this->monitoringRow($aliceToken, $prId)['can_edit']);
        $this->withToken($aliceToken)->putJson("/api/v1/purchase-requests/{$prId}/monitoring", ['values' => ['iar_no' => 'IAR-1']])
            ->assertForbidden();
    }

    public function test_the_sheet_filters_by_day_month_and_year_and_counts_the_matches(): void
    {
        $token = $this->loginAsAdmin();
        $sept14 = $this->createApprovedPr($token);
        $sept14Late = $this->createApprovedPr($token);
        $sept20 = $this->createApprovedPr($token);
        $march = $this->createApprovedPr($token);

        // Dates far from the seeded data so the totals are exact. 23:30 Manila still counts as the 14th.
        \App\Models\PurchaseRequest::whereKey($sept14)->update(['created_at' => '2019-09-14 08:00:00']);
        \App\Models\PurchaseRequest::whereKey($sept14Late)->update(['created_at' => '2019-09-14 23:30:00']);
        \App\Models\PurchaseRequest::whereKey($sept20)->update(['created_at' => '2019-09-20 10:00:00']);
        \App\Models\PurchaseRequest::whereKey($march)->update(['created_at' => '2019-03-02 10:00:00']);

        $ids = fn (array $query) => $this->withToken($token)
            ->getJson('/api/v1/purchase-requests/monitoring?'.http_build_query($query));

        $day = $ids(['date' => '2019-09-14']);
        $this->assertEquals(2, $day->json('total'));
        $this->assertEqualsCanonicalizing([$sept14, $sept14Late], collect($day->json('data'))->pluck('pr_id')->all());

        $this->assertEquals(3, $ids(['month' => '2019-09'])->json('total'));
        $this->assertEquals(4, $ids(['year' => 2019])->json('total'));
        $this->assertEquals(0, $ids(['date' => '2019-09-15'])->json('total'));

        $prNo = \App\Models\PurchaseRequest::find($march)->pr_no;
        $this->assertEquals([$march], collect($ids(['year' => 2019, 'search' => $prNo])->json('data'))->pluck('pr_id')->all());
        $this->assertEquals(4, $ids(['year' => 2019, 'status' => 'Approved,Cancelled'])->json('total'));
        $this->assertEquals(0, $ids(['year' => 2019, 'status' => 'Draft'])->json('total'));

        $ids(['month' => 'September'])->assertStatus(422);
    }
}
