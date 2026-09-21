<?php

namespace Tests\Feature;

use App\Models\PurchaseOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\SignsRfq;
use Tests\TestCase;

class PurchaseOrderApiTest extends TestCase
{
    use RefreshDatabase;
    use SignsRfq;

    protected bool $seed = true;

    private function loginAsAdmin(): string
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        return $login->json('token');
    }

    private function createApprovedPr(string $token): int
    {
        $create = $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'project_code' => 'PROJ-2026-001',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Create a PR for a PO test.',
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

    /** Full RFQ lifecycle through a BAC-Approved Abstract of Canvas; returns the RFQ id. */
    private function createApprovedAoc(string $token, int $prId): int
    {
        $rfqId = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
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
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => true])
            ->assertOk()->assertJsonPath('data.status', 'Approved');

        return $rfqId;
    }

    public function test_po_can_be_generated_from_a_bac_approved_aoc(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedAoc($token, $prId);

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")
            ->assertCreated()
            ->assertJsonPath('data.rfq_id', $rfqId)
            ->assertJsonPath('data.purchase_request_id', $prId)
            ->assertJsonPath('data.status', 'Draft')
            ->assertJsonPath('data.supplier_name', 'ACME Trading')
            ->assertJsonPath('data.items.0.unit_cost', '240.00')
            ->assertJsonPath('data.total_amount', '240.00')
            ->assertJsonStructure(['data' => ['po_no']]);

        $this->assertDatabaseHas('purchase_orders', ['rfq_id' => $rfqId, 'supplier_name' => 'ACME Trading']);
    }

    public function test_po_cannot_be_generated_before_aoc_is_bac_approved(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);

        $rfqId = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'items' => [['description' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_abc' => 250, 'total_abc' => 250]],
        ])->assertCreated()->json('data.id');

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertStatus(422);
    }

    public function test_po_cannot_be_generated_twice_from_the_same_rfq(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedAoc($token, $prId);

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertCreated();
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertStatus(422);
    }

    public function test_po_three_stage_chain_submit_obligate_account_and_final_approve(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedAoc($token, $prId);
        $poId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->json('data.id');

        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/submit")
            ->assertOk()->assertJsonPath('data.status', 'Pending Budget Obligation');

        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/obligate")
            ->assertOk()->assertJsonPath('data.status', 'Pending Accounting');

        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/account")
            ->assertOk()->assertJsonPath('data.status', 'Pending RD Approval');

        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/final-approve")
            ->assertOk()->assertJsonPath('data.status', 'Approved');

        $this->assertDatabaseHas('approval_actions', [
            'actionable_id' => $poId,
            'actionable_type' => PurchaseOrder::class,
            'action' => 'Signed',
        ]);

        $po = $this->withToken($token)->getJson("/api/v1/purchase-orders/{$poId}")->json('data');
        $this->assertNotNull($po['budget_officer_signed_at']);
        $this->assertNotNull($po['accounting_officer_signed_at']);
        $this->assertNotNull($po['approved_by_signed_at']);
    }

    public function test_po_stage_is_blocked_for_a_non_designated_signatory(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedAoc($token, $prId);
        $poId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->json('data.id');
        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/submit")->assertOk();

        $requesterLogin = $this->postJson('/api/v1/auth/login', [
            'email' => 'mdelacruz@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($requesterLogin->json('token'))
            ->postJson("/api/v1/approvals/po/{$poId}/obligate")
            ->assertStatus(403);
    }

    public function test_po_can_be_rejected_with_a_reason(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedAoc($token, $prId);
        $poId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->json('data.id');
        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/submit")->assertOk();

        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/reject")->assertStatus(422);

        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/reject", ['reason' => 'Supplier withdrew quotation.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Rejected');
    }

    public function test_delivery_waiver_is_recorded_only_once_approved(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedAoc($token, $prId);
        $poId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->json('data.id');

        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/deliver", ['waived' => false])->assertStatus(422);

        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/submit")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/obligate")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/account")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/final-approve")->assertOk();

        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/deliver", [
            'waived' => true,
            'reason' => 'Supplier can no longer fulfill the order.',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'Delivery Waived')
            ->assertJsonPath('data.delivery_waived', true);
    }
}
