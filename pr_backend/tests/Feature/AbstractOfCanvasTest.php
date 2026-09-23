<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\SignsRfq;
use Tests\TestCase;

class AbstractOfCanvasTest extends TestCase
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

        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => false])
            ->assertStatus(422); // remarks required

        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", [
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

        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => true])
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
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => false, 'remarks' => 'All quotes exceed the ABC.'])->assertOk();

        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/cancel", ['reason' => 'No viable supplier.'])
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
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => false, 'remarks' => 'Needs re-check.'])->assertOk();

        $requesterLogin = $this->postJson('/api/v1/auth/login', [
            'email' => 'mdelacruz@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($requesterLogin->json('token'))
            ->postJson("/api/v1/aoc/{$aocId}/twg-respond", ['response' => 'Not my call to make.'])
            ->assertStatus(403);
    }

    public function test_only_the_designated_bac_chair_or_vice_chair_can_review_or_cancel(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        [$rfqId] = $this->createQuotedRfq($token, $prId);
        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();

        // Admin holds the approvals module and a signature but is not a BAC signatory.
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => true])->assertStatus(403);

        // A BAC *member* (not the Chair/Vice-Chair) is refused too.
        $memberToken = $this->postJson('/api/v1/auth/login', ['email' => 'lreyes.bac@dost.gov.ph', 'password' => 'password123'])->json('token');
        $this->withToken($memberToken)->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => true])->assertStatus(403);

        // The Vice-Chair may return it; only a BAC signatory may then cancel.
        $this->asBac('vice-chair')->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => false, 'remarks' => 'Re-check quotes.'])->assertOk();
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/cancel", ['reason' => 'x'])->assertStatus(403);
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/cancel", ['reason' => 'No viable supplier.'])->assertOk();
    }

    public function test_submitting_for_review_notifies_the_bac_chair_and_vice_chair(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        [$rfqId] = $this->createQuotedRfq($token, $prId);
        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');

        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();

        foreach (['jbautista.bac@dost.gov.ph', 'rsantiago.bac@dost.gov.ph'] as $email) {
            $this->assertDatabaseHas('user_notifications', [
                'user_id' => \App\Models\User::where('email', $email)->value('id'),
                'type' => 'aoc_pending_bac_review',
            ]);
        }
        // A plain BAC member is not a reviewer, so no notification for them.
        $this->assertDatabaseMissing('user_notifications', [
            'user_id' => \App\Models\User::where('email', 'lreyes.bac@dost.gov.ph')->value('id'),
            'type' => 'aoc_pending_bac_review',
        ]);
    }

    public function test_a_twg_response_puts_it_back_in_front_of_the_bac(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        [$rfqId] = $this->createQuotedRfq($token, $prId);
        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => false, 'remarks' => 'Missing PhilGEPS.'])->assertOk();

        \App\Models\UserNotification::query()->delete();
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/twg-respond", ['response' => 'Confirmed valid.'])->assertOk();

        $this->assertSame(2, \App\Models\UserNotification::where('type', 'aoc_pending_bac_review')->count());
    }

    public function test_the_review_queue_lists_aocs_by_status(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        [$rfqId] = $this->createQuotedRfq($token, $prId);
        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');

        // Draft AOCs are not in the review queue.
        $this->asBac()->getJson('/api/v1/aoc?status=Pending BAC Review')->assertOk()->assertJsonCount(0, 'data');

        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();

        $queue = $this->asBac()->getJson('/api/v1/aoc?status=Pending BAC Review,BAC Returned')->assertOk();
        $queue->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $aocId)
            ->assertJsonPath('data.0.status', 'Pending BAC Review');
        $this->assertNotEmpty($queue->json('data.0.rfq_no'));
        $this->assertNotEmpty($queue->json('data.0.pr_no'));
        $this->assertNotEmpty($queue->json('data.0.winning_supplier_name'));
        $this->assertGreaterThan(0, $queue->json('data.0.winning_total'));
    }

    public function test_the_review_queue_is_closed_to_users_without_rfq_or_approvals_access(): void
    {
        $requesterToken = $this->postJson('/api/v1/auth/login', ['email' => 'mdelacruz@dost.gov.ph', 'password' => 'password123'])->json('token');

        $this->withToken($requesterToken)->getJson('/api/v1/aoc')->assertStatus(403);
    }

    public function test_bac_reviewers_are_flagged_on_the_current_user(): void
    {
        $this->asBac()->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.is_bac_chair', true)->assertJsonPath('data.is_bac_vice_chair', false);
        $this->asBac('vice-chair')->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.is_bac_vice_chair', true);
    }

    public function test_the_review_queue_limit_caps_the_query_instead_of_the_whole_queue(): void
    {
        $token = $this->loginAsAdmin();
        foreach (['Goods', 'Goods', 'Goods'] as $category) {
            $prId = $this->createApprovedPr($token);
            [$rfqId] = $this->createQuotedRfq($token, $prId, $category);
            $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
            $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();
        }

        $this->asBac()->getJson('/api/v1/aoc?status=Pending BAC Review&limit=2')->assertOk()->assertJsonCount(2, 'data');
        $this->asBac()->getJson('/api/v1/aoc?status=Pending BAC Review')->assertOk()->assertJsonCount(3, 'data');
    }
}
