<?php

namespace Tests\Feature;

use App\Models\Office;
use App\Models\PurchaseRequest;
use App\Models\RfqSupplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Concerns\SignsRfq;
use Tests\TestCase;

class DashboardSummaryTest extends TestCase
{
    use RefreshDatabase;
    use SignsRfq;

    protected bool $seed = true;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Mail::fake();
    }

    private function loginAsAdmin(): string
    {
        return $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    private function approvedPr(string $token): int
    {
        $prId = $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'project_code' => 'PROJ-2026-001',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Dashboard summary test.',
            'submit' => true,
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ])->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();

        return $prId;
    }

    /** @return array{0: int, 1: int} [prId, poId] with the signed PO released to the supplier. */
    private function forwardedPo(string $token): array
    {
        $prId = $this->approvedPr($token);
        [$rfqId] = $this->quotedRfq($token, $prId);
        $this->notedAoc($token, $rfqId);
        $poId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/submit")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/obligate")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/account")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/final-approve")->assertOk();

        return [$prId, $poId];
    }

    /** The PR ids the Monitoring Sheet lists under one dashboard stage. */
    private function idsInStage(string $token, string $stage): array
    {
        return collect($this->withToken($token)->getJson("/api/v1/purchase-requests/monitoring?stage={$stage}&per_page=100")->assertOk()->json('data'))
            ->pluck('pr_id')->all();
    }

    private function stageCounts(string $token): array
    {
        return collect($this->withToken($token)->getJson('/api/v1/dashboard/summary')->assertOk()->json('data.stages'))
            ->pluck('count', 'key')->all();
    }

    public function test_each_pr_sits_in_exactly_one_stage_and_the_sheet_filter_agrees(): void
    {
        $token = $this->loginAsAdmin();

        $awaiting = $this->approvedPr($token);

        $canvassing = $this->approvedPr($token);
        $this->quotedRfq($token, $canvassing);

        $atAoc = $this->approvedPr($token);
        [$rfqId] = $this->quotedRfq($token, $atAoc);
        $this->notedAoc($token, $rfqId);

        [$withSupplier] = $this->forwardedPo($token);
        [$delivered, $deliveredPo] = $this->forwardedPo($token);
        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$deliveredPo}/deliver", ['waived' => false])->assertOk();

        $this->assertContains($awaiting, $this->idsInStage($token, 'awaiting_rfq'));
        $this->assertContains($canvassing, $this->idsInStage($token, 'rfq'));
        $this->assertContains($atAoc, $this->idsInStage($token, 'aoc'));
        $this->assertContains($withSupplier, $this->idsInStage($token, 'with_supplier'));
        $this->assertContains($delivered, $this->idsInStage($token, 'delivered'));
        $this->assertNotContains($delivered, $this->idsInStage($token, 'with_supplier'));

        // Stages never overlap and never miss a PR: they add up to every PR the user can see.
        $counts = $this->stageCounts($token);
        $this->assertSame(array_keys(PurchaseRequest::STAGES), array_keys($counts));
        $this->assertEquals(PurchaseRequest::count(), array_sum($counts));
        foreach (array_keys(PurchaseRequest::STAGES) as $stage) {
            $this->assertEquals($counts[$stage], count($this->idsInStage($token, $stage)), "Stage {$stage} disagrees with the sheet.");
        }

        $this->withToken($token)->getJson('/api/v1/purchase-requests/monitoring?stage=nowhere')->assertStatus(422);
    }

    public function test_supply_sees_what_to_follow_up_with_suppliers(): void
    {
        $token = $this->loginAsAdmin();

        // An RFQ reply due tomorrow, and one still a week out that is not urgent yet.
        $prId = $this->approvedPr($token);
        $rfqId = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId, 'procurement_category' => 'Goods', 'canvasser' => 'Juan Dela Cruz',
            'items' => [['description' => 'Item', 'uom' => 'unit', 'quantity' => 1, 'unit_abc' => 300, 'total_abc' => 300]],
        ])->assertCreated()->json('data.id');
        $this->completeRfqSigning($rfqId);
        $this->addSuppliers($token, $rfqId);
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/send")->assertOk();
        $dueSoon = RfqSupplier::where('rfq_id', $rfqId)->orderBy('id')->first();
        $dueSoon->update(['reply_due_at' => now()->addDay(), 'supplier_contact_no' => '0917-000-0000']);

        [$poPrId, $poId] = $this->forwardedPo($token);
        $this->withToken($token)->putJson("/api/v1/purchase-requests/{$poPrId}/monitoring", ['values' => [
            'delivery_due_at' => now()->addDays(3)->toDateString(),
        ]])->assertOk();

        $followUps = $this->withToken($token)->getJson('/api/v1/dashboard/summary')->assertOk()->json('data.follow_ups');

        $replies = collect($followUps['rfq_replies_due']['items']);
        $this->assertEquals(1, $replies->where('rfq_id', $rfqId)->count());
        $this->assertSame('0917-000-0000', $replies->firstWhere('rfq_id', $rfqId)['contact_no']);
        $this->assertContains($poId, collect($followUps['pos_with_supplier']['items'])->pluck('po_id')->all());
        $this->assertContains($poPrId, collect($followUps['deliveries_due']['items'])->pluck('pr_id')->all());

        // Once the full delivery is recorded on the sheet, it is no longer something to chase.
        $this->withToken($token)->putJson("/api/v1/purchase-requests/{$poPrId}/monitoring", ['values' => [
            'delivered_full_at' => now()->toDateString(),
        ]])->assertOk();
        $deliveries = $this->withToken($token)->getJson('/api/v1/dashboard/summary')->json('data.follow_ups.deliveries_due.items');
        $this->assertNotContains($poPrId, collect($deliveries)->pluck('pr_id')->all());
    }

    public function test_a_requester_sees_only_their_own_prs_and_no_supply_follow_ups(): void
    {
        $alice = User::create([
            'name' => 'Alice', 'email' => 'dashboard-alice@dost.gov.ph', 'password' => bcrypt('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr'],
        ]);
        $aliceToken = $this->postJson('/api/v1/auth/login', ['email' => $alice->email, 'password' => 'password123'])->json('token');
        $prId = $this->approvedPr($this->loginAsAdmin());
        PurchaseRequest::whereKey($prId)->update(['requested_by' => $alice->id]);

        $data = $this->withToken($aliceToken)->getJson('/api/v1/dashboard/summary')->assertOk()->json('data');

        $this->assertEquals(1, $data['purchase_requests']['count']);
        $this->assertEquals(250, $data['purchase_requests']['amount']);
        $this->assertEquals(1, array_sum(array_column($data['stages'], 'count')));
        $this->assertNull($data['follow_ups']);
        $this->assertNull($data['rfqs']);
        $this->assertNull($data['approvals_pending']);
        $this->assertSame([$prId], array_column($data['recent_purchase_requests'], 'id'));
    }
}
