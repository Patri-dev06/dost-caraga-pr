<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\SignsRfq;
use Tests\TestCase;

class MonitoringSheetTest extends TestCase
{
    use RefreshDatabase;
    use SignsRfq;

    protected bool $seed = true;

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

    private function createApprovedAoc(string $token, int $prId): int
    {
        $rfqId = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'canvasser' => 'Juan Dela Cruz',
            'items' => [
                ['description' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_abc' => 250, 'total_abc' => 250],
            ],
        ])->assertCreated()->json('data.id');

        $this->signRfq($rfqId, 'bac-chair')->assertOk();
        $this->signRfq($rfqId, 'bac-vice-chair')->assertOk();
        $this->signRfq($rfqId, 'supply-officer')->assertOk();

        foreach (['ACME Trading', 'Bayanihan Supplies', 'Caraga Merchants'] as $name) {
            $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers", ['supplier_name' => $name])->assertCreated();
        }
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/send")->assertOk();

        $rfq = $this->withToken($token)->getJson("/api/v1/rfqs/{$rfqId}")->json('data');
        $rfqItemId = $rfq['items'][0]['id'];

        foreach (collect($rfq['suppliers'])->pluck('id') as $i => $supplierId) {
            $this->withToken($token)->putJson("/api/v1/rfqs/{$rfqId}/suppliers/{$supplierId}/quote", [
                'items' => [['rfq_item_id' => $rfqItemId, 'unit_price' => 240 + $i]],
            ])->assertOk();
        }

        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => true])->assertOk();

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
}
