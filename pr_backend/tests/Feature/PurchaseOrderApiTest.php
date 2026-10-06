<?php

namespace Tests\Feature;

use App\Models\PurchaseOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Concerns\SignsRfq;
use Tests\TestCase;

class PurchaseOrderApiTest extends TestCase
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

    private function createApprovedPr(string $token, ?array $items = null): int
    {
        $create = $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'project_code' => 'PROJ-2026-001',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Create a PR for a PO test.',
            'submit' => true,
            'items' => $items ?? [
                ['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250],
            ],
        ])->assertCreated();

        $prId = $create->json('data.id');
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();

        return $prId;
    }

    /** Full RFQ lifecycle through BAC approval and automatic PO creation; returns the RFQ id. */
    private function createApprovedAoc(string $token, int $prId): int
    {
        [$rfqId] = $this->quotedRfq($token, $prId);
        $this->notedAoc($token, $rfqId);

        return $rfqId;
    }

    public function test_po_is_generated_automatically_when_supply_confirms_the_item_awards(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedAoc($token, $prId);

        $this->assertDatabaseHas('purchase_orders', ['rfq_id' => $rfqId, 'supplier_name' => 'ACME Trading']);

        // The legacy endpoint is now an idempotent recovery/read path for older clients.
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")
            ->assertOk()
            ->assertJsonPath('data.rfq_id', $rfqId)
            ->assertJsonPath('data.purchase_request_id', $prId)
            ->assertJsonPath('data.status', 'Draft')
            ->assertJsonPath('data.supplier_name', 'ACME Trading')
            ->assertJsonPath('data.items.0.unit_cost', '240.00')
            ->assertJsonPath('data.total_amount', '240.00')
            ->assertJsonStructure(['data' => ['po_no']]);

    }

    public function test_po_waits_for_supply_to_note_the_lowest_bidder(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        [$rfqId] = $this->quotedRfq($token, $prId);
        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->json('data.id');
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => true])->assertOk();

        // BAC-approved but not yet noted by Supply.
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertStatus(422);

        // Only the Supply Officer notes it (the BAC Chair cannot).
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/note-lowest-bidder")->assertStatus(403);
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/note-lowest-bidder")
            ->assertOk()
            ->assertJsonPath('data.supply_noted_name', 'Supply Unit Admin')
            ->assertJsonCount(1, 'purchase_orders');
        $this->assertDatabaseCount('purchase_orders', 1);
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

    public function test_automatic_po_creation_is_idempotent_for_the_same_rfq(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token);
        $rfqId = $this->createApprovedAoc($token, $prId);

        $firstId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertOk()->json('data.id');
        $secondId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertOk()->json('data.id');
        $this->assertSame($firstId, $secondId);
        $this->assertSame(1, PurchaseOrder::where('rfq_id', $rfqId)->count());
    }

    public function test_each_item_is_awarded_to_its_lowest_compliant_supplier_and_creates_one_po_per_awardee(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createApprovedPr($token, [
            ['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 2, 'unit_cost' => 150],
            ['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 3, 'unit_cost' => 250],
        ]);
        $rfqId = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'procurement_category' => 'Goods',
            'canvasser' => 'Juan Dela Cruz',
            'items' => [
                ['description' => 'Bond paper', 'uom' => 'ream', 'quantity' => 2, 'unit_abc' => 150, 'total_abc' => 300],
                ['description' => 'Ballpen', 'uom' => 'box', 'quantity' => 3, 'unit_abc' => 250, 'total_abc' => 750],
            ],
        ])->assertCreated()->json('data.id');

        $this->addSuppliers($token, $rfqId);
        $this->completeRfqSigning($rfqId);
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/send")->assertOk();
        $rfq = $this->withToken($token)->getJson("/api/v1/rfqs/{$rfqId}")->json('data');
        [$paperId, $penId] = collect($rfq['items'])->pluck('id')->all();
        $suppliers = collect($rfq['suppliers'])->keyBy('supplier_name');

        $this->recordQuote($token, $rfqId, $suppliers['ACME Trading']['id'], [
            ['rfq_item_id' => $paperId, 'offer_status' => 'Quoted', 'unit_price' => 100],
            ['rfq_item_id' => $penId, 'offer_status' => 'Quoted', 'unit_price' => 230],
        ])->assertOk();
        $this->recordQuote($token, $rfqId, $suppliers['Bayanihan Supplies']['id'], [
            ['rfq_item_id' => $paperId, 'offer_status' => 'Quoted', 'unit_price' => 120],
            ['rfq_item_id' => $penId, 'offer_status' => 'Quoted', 'unit_price' => 200],
        ])->assertOk();
        $this->recordQuote($token, $rfqId, $suppliers['Caraga Merchants']['id'], [
            ['rfq_item_id' => $paperId, 'offer_status' => 'Quoted', 'unit_price' => 130],
            ['rfq_item_id' => $penId, 'offer_status' => 'No Bid'],
        ])->assertOk();

        $aoc = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated();
        $aocId = $aoc->json('data.id');
        $this->assertSame(['ACME Trading', 'Bayanihan Supplies'], $aoc->json('data.winning_supplier_names'));
        $aoc->assertJsonPath('data.awards.0.winning_supplier_name', 'ACME Trading')
            ->assertJsonPath('data.awards.1.winning_supplier_name', 'Bayanihan Supplies');

        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => true])->assertOk();
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/note-lowest-bidder")
            ->assertOk()->assertJsonCount(2, 'purchase_orders');

        $orders = PurchaseOrder::with('items')->where('rfq_id', $rfqId)->orderBy('supplier_name')->get()->keyBy('supplier_name');
        $this->assertCount(2, $orders);
        $this->assertSame([$paperId], $orders['ACME Trading']->items->pluck('rfq_item_id')->all());
        $this->assertSame('200.00', $orders['ACME Trading']->total_amount);
        $this->assertSame([$penId], $orders['Bayanihan Supplies']->items->pluck('rfq_item_id')->all());
        $this->assertSame('600.00', $orders['Bayanihan Supplies']->total_amount);
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

        // RD approval completes the signed PO and releases it to Supply to bring to the supplier.
        $final = $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/final-approve")
            ->assertOk()->assertJsonPath('data.status', 'Forwarded to Supplier');
        // E-signatures are off until PNPKI: the PO records who approved and when, with no signature image.
        $this->assertNull($final->json('data.approved_by_signature'));
        $this->assertDatabaseHas('user_notifications', ['type' => 'po_forwarded', 'user_id' => \App\Models\PurchaseRequest::find($prId)->requested_by]);

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

        // "Waived -> Cancel PR -> Notify end-user to Re-PR".
        $this->assertDatabaseHas('purchase_requests', ['id' => $prId, 'status' => 'Cancelled', 'cancelled_from' => 'PO']);
        $this->assertDatabaseHas('user_notifications', ['type' => 'pr_cancelled']);
    }
}
