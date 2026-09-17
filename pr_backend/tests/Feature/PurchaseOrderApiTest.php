<?php

namespace Tests\Feature;

use App\Models\PurchaseOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PurchaseOrderApiTest extends TestCase
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

    /** Creates, submits, recommends, and approves an RFQ (with a quoted price) for the given PR; returns its id. */
    private function createApprovedRfq(string $token, int $prId): int
    {
        $create = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'supplier_name' => 'ACME Trading',
            'supplier_address' => '123 Rizal St., Butuan City',
            'supplier_contact_no' => '09171234567',
            'supplier_tin' => '000-111-222-000',
            'items' => [
                [
                    'description' => 'A4-sized Bond Paper',
                    'uom' => 'ream',
                    'quantity' => 1,
                    'unit_abc' => 250,
                    'total_abc' => 250,
                    'unit_price' => 240,
                    'total_price' => 240,
                ],
            ],
        ])->assertCreated();

        $rfqId = $create->json('data.id');

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/submit")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/rfq/{$rfqId}/recommend")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/rfq/{$rfqId}/approve")->assertOk()->assertJsonPath('data.status', 'Approved');

        return $rfqId;
    }

    public function test_po_can_be_generated_from_an_approved_rfq(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedRfq($token, $prId);

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

    public function test_po_number_is_continuous_and_formatted_per_year(): void
    {
        $token = $this->loginAsAdmin();
        $prId1 = $this->createApprovedPr($token);
        $rfqId1 = $this->createApprovedRfq($token, $prId1);
        $prId2 = $this->createApprovedPr($token);
        $rfqId2 = $this->createApprovedRfq($token, $prId2);

        $first = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId1}/generate-po")->assertCreated()->json('data.po_no');
        $second = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId2}/generate-po")->assertCreated()->json('data.po_no');

        $year = now()->year;
        $this->assertMatchesRegularExpression("/^PO-{$year}-\\d{4}$/", $first);
        $this->assertMatchesRegularExpression("/^PO-{$year}-\\d{4}$/", $second);
        $this->assertNotSame($first, $second);
    }

    public function test_po_cannot_be_generated_from_a_non_approved_rfq(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);

        $create = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'items' => [['description' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_abc' => 250, 'total_abc' => 250]],
        ])->assertCreated();

        $this->withToken($token)->postJson("/api/v1/rfqs/{$create->json('data.id')}/generate-po")->assertStatus(422);
    }

    public function test_po_cannot_be_generated_twice_from_the_same_rfq(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedRfq($token, $prId);

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertCreated();
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertStatus(422);
    }

    public function test_po_can_be_submitted_recommended_and_approved(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedRfq($token, $prId);
        $poId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->json('data.id');

        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'For Recommendation');

        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/recommend")
            ->assertOk()
            ->assertJsonPath('data.status', 'For Approval');

        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'Approved');

        $this->assertDatabaseHas('approval_actions', [
            'actionable_id' => $poId,
            'actionable_type' => PurchaseOrder::class,
            'action' => 'Approved',
        ]);
    }

    public function test_po_can_be_rejected_with_a_reason(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedRfq($token, $prId);
        $poId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->json('data.id');

        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/submit")->assertOk();

        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/reject")->assertStatus(422);

        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/reject", ['reason' => 'Supplier withdrew quotation.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Rejected');
    }
}
