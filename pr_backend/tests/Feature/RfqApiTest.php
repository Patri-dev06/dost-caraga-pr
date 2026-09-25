<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Concerns\SignsRfq;
use Tests\TestCase;

class RfqApiTest extends TestCase
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

        $rfqNo = $this->createRfq($token, $prId)
            ->assertCreated()
            ->assertJsonPath('data.purchase_request_id', $prId)
            ->assertJsonPath('data.status', 'Draft')
            ->assertJsonPath('data.procurement_category', 'Goods')
            ->assertJsonPath('data.items.0.description', 'A4-sized Bond Paper')
            ->assertJsonStructure(['data' => ['rfq_no']])
            ->json('data.rfq_no');

        $this->assertDatabaseHas('rfqs', ['purchase_request_id' => $prId, 'rfq_no' => $rfqNo]);
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

    public function test_rfq_update_is_blocked_once_signing_has_started(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createRfq($token, $prId)->json('data.id');

        $this->signRfq($rfqId, 'supply-officer')->assertOk();

        $this->withToken($token)->putJson("/api/v1/rfqs/{$rfqId}", ['canvasser' => 'Should Not Save'])
            ->assertStatus(422);
    }

    public function test_signing_chain_must_proceed_in_order_and_is_recorded(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createRfq($token, $prId)->json('data.id');

        // Flowchart order: the Supply Officer counter-signs first, so the BAC cannot sign a Draft.
        $this->signRfq($rfqId, 'bac')->assertStatus(422);

        $this->completeRfqSigning($rfqId);
        $this->signRfq($rfqId, 'bac-vice-chair')->assertStatus(422); // one BAC signature completes the step

        $this->assertDatabaseHas('approval_actions', [
            'actionable_id' => $rfqId,
            'actionable_type' => \App\Models\Rfq::class,
            'action' => 'Signed',
        ]);
    }

    public function test_signing_is_blocked_for_a_non_designated_signatory(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createRfq($token, $prId)->json('data.id');

        $requesterLogin = $this->postJson('/api/v1/auth/login', [
            'email' => 'mdelacruz@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($requesterLogin->json('token'))
            ->postJson("/api/v1/rfqs/{$rfqId}/sign/supply-officer")
            ->assertStatus(403);
    }

    public function test_full_canvass_flow_send_quote_and_generate_aoc(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createRfq($token, $prId)->json('data.id');

        $this->completeRfqSigning($rfqId);
        $this->addSuppliers($token, $rfqId);

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/send")
            ->assertOk()
            ->assertJsonPath('data.status', 'Canvassing')
            ->assertJsonCount(3, 'data.suppliers');

        $rfq = $this->withToken($token)->getJson("/api/v1/rfqs/{$rfqId}")->json('data');
        $rfqItemId = $rfq['items'][0]['id'];
        $supplierIds = collect($rfq['suppliers'])->pluck('id');

        // Record quotes for all 3 suppliers so the AOC can be generated.
        foreach ($supplierIds as $i => $supplierId) {
            $this->recordQuote($token, $rfqId, $supplierId, [['rfq_item_id' => $rfqItemId, 'unit_price' => 240 + $i]])->assertOk();
        }

        $aoc = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")
            ->assertCreated()
            ->assertJsonPath('data.status', 'Draft')
            ->json('data');

        // Lowest quote (240) should win.
        $this->assertSame($supplierIds[0], $aoc['winning_rfq_supplier_id']);
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

    public function test_rfq_shows_who_prepared_it_with_their_position(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);

        // No position on the profile: falls back to the account's role, like the signatory pickers.
        $rfq = $this->createRfq($token, $prId)->assertCreated();
        $rfq->assertJsonPath('data.prepared_by.name', 'Supply Unit Admin');
        $this->assertContains($rfq->json('data.prepared_by.position'), ['Admin', 'Recommender']); // the seeded admin holds both roles

        // A position saved on the profile wins.
        \App\Models\User::where('email', 'admin@dost.gov.ph')->update(['position' => 'Supply Officer III']);
        $this->withToken($token)->getJson('/api/v1/rfqs/'.$rfq->json('data.id'))
            ->assertOk()->assertJsonPath('data.prepared_by.position', 'Supply Officer III');
    }
}
