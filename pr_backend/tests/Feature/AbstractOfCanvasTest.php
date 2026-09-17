<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AbstractOfCanvasTest extends TestCase
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
            'purpose' => 'Create a PR for an AOC test.',
            'submit' => true,
            'items' => [
                ['name' => 'Laptop, Business Class', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 55000],
            ],
        ])->assertCreated();

        $prId = $create->json('data.id');
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();

        return $prId;
    }

    /** Creates a fully-canvassed, quoted RFQ (all 3 suppliers replied); returns [rfqId, rfqItemId]. */
    private function createQuotedRfq(string $token, int $prId, string $category = 'Goods'): array
    {
        $rfqId = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'procurement_category' => $category,
            'items' => [
                ['description' => 'Laptop, Business Class', 'uom' => 'unit', 'quantity' => 1, 'unit_abc' => 55000, 'total_abc' => 55000],
            ],
        ])->assertCreated()->json('data.id');

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/sign/bac-chair")->assertOk();
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/sign/bac-vice-chair")->assertOk();
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/sign/supply-officer")->assertOk();

        foreach (['ACME Trading', 'Bayanihan Supplies', 'Caraga Merchants'] as $name) {
            $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers", ['supplier_name' => $name])->assertCreated();
        }
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/send")->assertOk();

        $rfq = $this->withToken($token)->getJson("/api/v1/rfqs/{$rfqId}")->json('data');
        $rfqItemId = $rfq['items'][0]['id'];

        foreach (collect($rfq['suppliers'])->pluck('id') as $i => $supplierId) {
            $this->withToken($token)->putJson("/api/v1/rfqs/{$rfqId}/suppliers/{$supplierId}/quote", [
                'items' => [['rfq_item_id' => $rfqItemId, 'unit_price' => 54000 + ($i * 1000)]],
            ])->assertOk();
        }

        return [$rfqId, $rfqItemId];
    }

    public function test_goods_aoc_generates_without_twg_notes(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        [$rfqId] = $this->createQuotedRfq($token, $prId, 'Goods');

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")
            ->assertCreated()
            ->assertJsonPath('data.procurement_category', 'Goods');
    }

    public function test_equipment_aoc_requires_twg_evaluation_notes(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        [$rfqId] = $this->createQuotedRfq($token, $prId, 'Equipment');

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertStatus(422);

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc", [
            'twg_evaluation_notes' => 'Specs verified against DOST ICT equipment standards.',
        ])->assertCreated();
    }

    public function test_venue_category_is_not_yet_supported(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        [$rfqId] = $this->createQuotedRfq($token, $prId, 'Venue');

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertStatus(422);
    }

    public function test_bac_fail_routes_to_twg_and_loops_back_to_bac_review(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        [$rfqId] = $this->createQuotedRfq($token, $prId);

        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();

        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => false])
            ->assertStatus(422); // remarks required

        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/bac-review", [
            'pass' => false,
            'remarks' => 'Lowest bidder is missing a valid PhilGEPS registration.',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'BAC Returned');

        // TWG responds, sending it back to BAC for another review.
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/twg-respond", [
            'response' => 'Registration confirmed valid; renewal was just delayed in PhilGEPS processing.',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'Pending BAC Review');

        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => true])
            ->assertOk()
            ->assertJsonPath('data.status', 'Approved');
    }

    public function test_bac_can_cancel_a_returned_aoc_and_its_rfq(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        [$rfqId] = $this->createQuotedRfq($token, $prId);

        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => false, 'remarks' => 'All quotes exceed the ABC.'])->assertOk();

        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/cancel", ['reason' => 'No viable supplier.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Cancelled');

        $this->assertDatabaseHas('rfqs', ['id' => $rfqId, 'status' => 'Cancelled']);
    }

    public function test_twg_respond_is_blocked_for_a_non_designated_lead(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        [$rfqId] = $this->createQuotedRfq($token, $prId);

        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => false, 'remarks' => 'Needs re-check.'])->assertOk();

        $requesterLogin = $this->postJson('/api/v1/auth/login', [
            'email' => 'mdelacruz@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($requesterLogin->json('token'))
            ->postJson("/api/v1/aoc/{$aocId}/twg-respond", ['response' => 'Not my call to make.'])
            ->assertStatus(403);
    }
}
