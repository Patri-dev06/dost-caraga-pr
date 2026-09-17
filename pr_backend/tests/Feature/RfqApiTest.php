<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class RfqApiTest extends TestCase
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

    /** Creates, submits, recommends, and approves a fresh PR; returns its id. */
    private function createApprovedPr(string $token): int
    {
        $create = $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'project_code' => 'PROJ-2026-001',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Create a PR for an RFQ test.',
            'submit' => true,
            'items' => [
                [
                    'name' => 'A4-sized Bond Paper',
                    'description' => 'A4 sized bond paper.',
                    'uom' => 'ream',
                    'quantity' => 1,
                    'unit_cost' => 250,
                ],
            ],
        ])->assertCreated();

        $prId = $create->json('data.id');

        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk()->assertJsonPath('data.status', 'Approved');

        return $prId;
    }

    private function createRfq(string $token, int $prId): TestResponse
    {
        return $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'supplier_name' => 'ACME Trading',
            'supplier_address' => '123 Rizal St., Butuan City',
            'supplier_contact_no' => '09171234567',
            'canvasser' => 'Juan Dela Cruz',
            'items' => [
                [
                    'description' => 'A4-sized Bond Paper',
                    'uom' => 'ream',
                    'quantity' => 1,
                    'unit_abc' => 250,
                    'total_abc' => 250,
                ],
            ],
        ]);
    }

    public function test_rfq_can_be_created_from_an_approved_purchase_request(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);

        $this->createRfq($token, $prId)
            ->assertCreated()
            ->assertJsonPath('data.purchase_request_id', $prId)
            ->assertJsonPath('data.status', 'Draft')
            ->assertJsonPath('data.supplier_name', 'ACME Trading')
            ->assertJsonPath('data.items.0.description', 'A4-sized Bond Paper')
            ->assertJsonStructure(['data' => ['rfq_no']]);

        $this->assertDatabaseHas('rfqs', ['purchase_request_id' => $prId, 'supplier_name' => 'ACME Trading']);
    }

    public function test_rfq_number_is_continuous_and_formatted_per_year(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);

        $first = $this->createRfq($token, $prId)->assertCreated()->json('data.rfq_no');
        $second = $this->createRfq($token, $prId)->assertCreated()->json('data.rfq_no');

        $year = now()->year;
        $this->assertMatchesRegularExpression("/^RFQ-{$year}-\\d{4}$/", $first);
        $this->assertMatchesRegularExpression("/^RFQ-{$year}-\\d{4}$/", $second);
        $this->assertNotSame($first, $second);
    }

    public function test_rfq_cannot_be_created_from_a_non_approved_purchase_request(): void
    {
        $token = $this->loginAsAdmin();

        $draft = $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'project_code' => 'PROJ-2026-001',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Draft PR that should block RFQ creation.',
            'items' => [
                ['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250],
            ],
        ])->assertCreated();

        $this->createRfq($token, $draft->json('data.id'))->assertStatus(422);
    }

    public function test_rfq_can_be_submitted_recommended_and_approved(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createRfq($token, $prId)->json('data.id');

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'For Recommendation');

        $this->withToken($token)->postJson("/api/v1/approvals/rfq/{$rfqId}/recommend")
            ->assertOk()
            ->assertJsonPath('data.status', 'For Approval');

        $this->withToken($token)->postJson("/api/v1/approvals/rfq/{$rfqId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'Approved');

        $this->assertDatabaseHas('approval_actions', [
            'actionable_id' => $rfqId,
            'actionable_type' => \App\Models\Rfq::class,
            'action' => 'Approved',
        ]);
    }

    public function test_rfq_can_be_rejected_with_a_reason(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createRfq($token, $prId)->json('data.id');

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/submit")->assertOk();

        $this->withToken($token)->postJson("/api/v1/approvals/rfq/{$rfqId}/reject")
            ->assertStatus(422);

        $this->withToken($token)->postJson("/api/v1/approvals/rfq/{$rfqId}/reject", ['reason' => 'Quotation exceeds the ABC.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Rejected');
    }

    public function test_rfq_update_is_blocked_once_no_longer_draft(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createRfq($token, $prId)->json('data.id');

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/submit")->assertOk();

        $this->withToken($token)->putJson("/api/v1/rfqs/{$rfqId}", ['supplier_name' => 'Should Not Save'])
            ->assertStatus(422);
    }

    public function test_rfqs_can_be_listed_and_filtered_by_purchase_request(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $this->createRfq($token, $prId)->assertCreated();

        $this->withToken($token)->getJson("/api/v1/rfqs?purchase_request_id={$prId}")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }
}
