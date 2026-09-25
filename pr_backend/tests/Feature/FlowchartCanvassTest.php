<?php

namespace Tests\Feature;

use App\Models\PurchaseRequest;
use App\Models\RfqSupplier;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Concerns\SignsRfq;
use Tests\TestCase;

/** Flowchart green, orange and yellow lanes: directory, staff-recorded canvass, 7-day sweep, TWG, venues, PO hand-off. */
class FlowchartCanvassTest extends TestCase
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
        return $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    /** An approved PR (admin files it, optionally on someone else's behalf). */
    private function approvedPr(string $token, ?string $requesterEmail = null): int
    {
        $prId = $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Flowchart canvass test.',
            'requested_by' => $requesterEmail ? User::where('email', $requesterEmail)->value('id') : null,
            'submit' => true,
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ])->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();

        return $prId;
    }

    private function signedRfq(string $token, int $prId, string $category = 'Goods', int $items = 1): int
    {
        $rfqId = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'procurement_category' => $category,
            'items' => collect(range(1, $items))->map(fn ($i) => ['description' => "Item {$i}", 'uom' => 'unit', 'quantity' => 2, 'unit_abc' => 500, 'total_abc' => 1000])->all(),
        ])->assertCreated()->json('data.id');
        $this->completeRfqSigning($rfqId);

        return $rfqId;
    }

    /** Marks the RFQ as sent to 3 suppliers; returns their rfq_supplier ids in order. */
    private function sendTo(string $token, int $rfqId, array $names = ['ACME Trading', 'Bayanihan Supplies', 'Caraga Merchants']): array
    {
        $this->addSuppliers($token, $rfqId, $names);

        return collect($this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/send")->assertOk()->json('data.suppliers'))
            ->pluck('id')->all();
    }

    private function itemIds(string $token, int $rfqId): array
    {
        return collect($this->withToken($token)->getJson("/api/v1/rfqs/{$rfqId}")->json('data.items'))->pluck('id')->all();
    }

    // --- Supplier directory: "Filter Supplier based on category (Goods, Services)" ---

    public function test_supplier_directory_filters_by_category_and_the_rfq_only_takes_the_matching_one(): void
    {
        $token = $this->loginAsAdmin();
        $goods = $this->withToken($token)->postJson('/api/v1/suppliers', ['name' => 'Butuan Office Depot', 'category' => 'Goods', 'email' => 'sales@bod.example'])->assertCreated()->json('data.id');
        $venue = $this->withToken($token)->postJson('/api/v1/suppliers', ['name' => 'Almont Hotel', 'category' => 'Services'])->assertCreated()->json('data.id');
        $this->withToken($token)->postJson('/api/v1/suppliers', ['name' => 'Almont Hotel', 'category' => 'Services'])->assertStatus(422); // duplicate

        $this->withToken($token)->getJson('/api/v1/suppliers?category=Services')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Almont Hotel');

        $rfqId = $this->signedRfq($token, $this->approvedPr($token));
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers", ['supplier_id' => $venue])->assertStatus(422);
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers", ['supplier_id' => $goods])->assertCreated()
            ->assertJsonPath('data.suppliers.0.supplier_email', 'sales@bod.example');
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers", ['supplier_id' => $goods])->assertStatus(422); // already on it

        $this->withToken($token)->deleteJson("/api/v1/suppliers/{$goods}")->assertOk()->assertJsonPath('data.active', false);
        $rfq2 = $this->signedRfq($token, $this->approvedPr($token));
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfq2}/suppliers", ['supplier_id' => $goods])->assertStatus(422); // deactivated
    }

    public function test_a_typed_in_supplier_is_added_to_the_directory_in_the_rfqs_category(): void
    {
        $token = $this->loginAsAdmin();
        $rfqId = $this->signedRfq($token, $this->approvedPr($token), 'Venue');
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers", ['supplier_name' => 'Watergate Hotel'])->assertCreated();

        $this->assertDatabaseHas('suppliers', ['name' => 'Watergate Hotel', 'category' => 'Services']);
    }

    // --- Signing order ---

    public function test_signing_routes_supply_officer_first_then_notifies_both_bac_signatories(): void
    {
        $token = $this->loginAsAdmin();
        $rfqId = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $this->approvedPr($token),
            'items' => [['description' => 'Item', 'uom' => 'unit', 'quantity' => 1]],
        ])->json('data.id');
        $this->assertDatabaseHas('user_notifications', ['type' => 'rfq_signing', 'user_id' => User::where('email', 'admin@dost.gov.ph')->value('id')]);

        $this->signRfq($rfqId, 'supply-officer')->assertOk();
        foreach (['jbautista.bac@dost.gov.ph', 'rsantiago.bac@dost.gov.ph'] as $email) {
            $this->assertDatabaseHas('user_notifications', ['type' => 'rfq_signing', 'user_id' => User::where('email', $email)->value('id')]);
        }

        $this->signRfq($rfqId, 'bac-vice-chair')->assertOk()->assertJsonPath('data.bac_signed_role', 'BAC Vice-Chairman')->assertJsonPath('data.status', 'Ready to Send');
    }

    // --- Canvass: Supply delivers the RFQ and records each signed quotation ---

    public function test_sending_only_starts_the_reply_window_and_never_contacts_a_supplier(): void
    {
        $token = $this->loginAsAdmin();
        $rfqId = $this->signedRfq($token, $this->approvedPr($token));
        Mail::fake();

        $ids = $this->sendTo($token, $rfqId);

        $this->assertCount(3, $ids);
        foreach ($ids as $id) {
            $supplier = RfqSupplier::find($id);
            $this->assertSame('Sent', $supplier->status);
            $this->assertNotNull($supplier->reply_due_at);
            $this->assertNull($supplier->portal_token_hash);
        }
        // Suppliers have no part in the system: nothing is emailed to them.
        Mail::assertNotQueued(\App\Mail\SystemMessage::class, fn ($m) => $m->hasTo('acmetrading@example.com'));
        // And there is no public Supplier Portal to reach.
        $this->getJson('/api/v1/portal/rfq/anything')->assertNotFound();
    }

    public function test_supply_records_each_signed_quotation_as_it_comes_back(): void
    {
        $token = $this->loginAsAdmin();
        $rfqId = $this->signedRfq($token, $this->approvedPr($token), 'Goods', 2);
        [$firstId, $secondId] = $this->sendTo($token, $rfqId);
        $items = $this->itemIds($token, $rfqId);

        $prices = [['rfq_item_id' => $items[0], 'unit_price' => 480], ['rfq_item_id' => $items[1], 'unit_price' => 450]];
        $this->recordQuote($token, $rfqId, $firstId, [$prices[0]])->assertStatus(422); // every item must be quoted
        $this->recordQuote($token, $rfqId, $firstId, $prices)->assertOk();
        $this->recordQuote($token, $rfqId, $firstId, $prices)->assertStatus(422); // only once

        $supplier = RfqSupplier::find($firstId);
        $this->assertSame('Replied', $supplier->status);
        $this->assertSame('Staff', $supplier->quote_submitted_via);
        Storage::disk('local')->assertExists($supplier->quotation_path);
        $this->assertDatabaseHas('user_notifications', ['type' => 'rfq_quote_received']);
        $this->assertSame('Sent', RfqSupplier::find($secondId)->status);
        $this->withToken($token)->get("/api/v1/rfqs/{$rfqId}/suppliers/{$firstId}/quotation")->assertOk();
    }

    public function test_the_hourly_sweep_cancels_a_supplier_that_did_not_reply_in_7_days(): void
    {
        $token = $this->loginAsAdmin();
        $rfqId = $this->signedRfq($token, $this->approvedPr($token));
        $ids = $this->sendTo($token, $rfqId);
        $items = $this->itemIds($token, $rfqId);
        $this->recordQuote($token, $rfqId, $ids[0], [['rfq_item_id' => $items[0], 'unit_price' => 400]])->assertOk();

        $this->travel(6)->days();
        $this->artisan('rfq:expire-unanswered')->assertSuccessful();
        $this->assertSame('Sent', RfqSupplier::find($ids[1])->status);

        Mail::fake();
        $this->travel(2)->days();
        $this->artisan('rfq:expire-unanswered')->assertSuccessful();

        foreach ([$ids[1], $ids[2]] as $id) {
            $this->assertSame('TimedOut', RfqSupplier::find($id)->status);
        }
        $this->assertSame('Replied', RfqSupplier::find($ids[0])->status);
        // Supply is told to choose replacements; the supplier itself is not emailed.
        $this->assertDatabaseHas('user_notifications', ['type' => 'rfq_supplier_cancelled']);
        Mail::assertNotQueued(\App\Mail\SystemMessage::class, fn ($m) => $m->hasTo('bayanihansupplies@example.com'));
        $this->withToken($this->loginAsAdmin())->getJson("/api/v1/rfqs/{$rfqId}")->assertJsonPath('data.open_supplier_slots', 2); // 8 days on, sign in again
    }

    public function test_choose_n_replacement_suppliers_fills_only_the_open_slots(): void
    {
        $token = $this->loginAsAdmin();
        $rfqId = $this->signedRfq($token, $this->approvedPr($token));
        $ids = $this->sendTo($token, $rfqId);

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers/choose", ['suppliers' => [['supplier_name' => 'Too Early Co.']]])->assertStatus(422); // no open slot yet
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers/{$ids[0]}/cancel", ['reason' => 'Declined by phone.'])->assertOk();
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers/choose", ['suppliers' => [['supplier_name' => 'One Co.'], ['supplier_name' => 'Two Co.']]])->assertStatus(422); // n = 1

        $response = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers/choose", ['suppliers' => [['supplier_name' => 'Surigao Supply', 'supplier_email' => 'q@surigao.example']]])
            ->assertCreated()->assertJsonPath('data.open_supplier_slots', 0);
        $new = collect($response->json('data.suppliers'))->firstWhere('supplier_name', 'Surigao Supply');
        $this->assertSame('Sent', $new['status']);
        $this->assertSame($new['id'], RfqSupplier::find($ids[0])->replaced_by_supplier_id);
    }

    public function test_a_hand_delivered_quote_needs_the_signed_quotation_attached(): void
    {
        $token = $this->loginAsAdmin();
        $rfqId = $this->signedRfq($token, $this->approvedPr($token));
        $ids = $this->sendTo($token, $rfqId);
        $items = $this->itemIds($token, $rfqId);

        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers/{$ids[0]}/quote", ['items' => [['rfq_item_id' => $items[0], 'unit_price' => 400]]])->assertStatus(422);
        $this->recordQuote($token, $rfqId, $ids[0], [['rfq_item_id' => $items[0], 'unit_price' => 400]])->assertOk();
        $this->assertSame('Staff', RfqSupplier::find($ids[0])->quote_submitted_via);
    }

    // --- Equipment: TWG check of each item with each supplier ---

    public function test_equipment_winner_is_the_lowest_supplier_that_passed_the_twg_check(): void
    {
        $token = $this->loginAsAdmin();
        [$rfqId, $itemId, $ids] = $this->quotedRfq($token, $this->approvedPr($token), 'Equipment', 100, 50); // 100, 150, 200

        $this->asBac()->postJson("/api/v1/rfqs/{$rfqId}/suppliers/{$ids[0]}/twg-check", ['items' => [['rfq_item_id' => $itemId, 'complies' => true]]])->assertStatus(403);
        $this->withToken($token)->putJson("/api/v1/rfqs/{$rfqId}/twg/notes", ['notes' => 'Checked against the technical specifications.'])->assertOk();
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers/{$ids[0]}/twg-check", ['items' => [['rfq_item_id' => $itemId, 'complies' => false, 'remarks' => 'Wrong model.']]])->assertOk();
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertStatus(422); // "Did all supplier fail? No" -> keep checking the rest
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers/{$ids[1]}/twg-check", ['items' => [['rfq_item_id' => $itemId, 'complies' => true]]])->assertOk();
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers/{$ids[2]}/twg-check", ['items' => [['rfq_item_id' => $itemId, 'complies' => true]]])->assertOk();

        $aoc = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data');
        $this->assertSame($ids[1], $aoc['winning_rfq_supplier_id']); // cheapest (ids[0]) failed
    }

    public function test_when_every_supplier_fails_the_twg_check_supply_chooses_n_new_ones(): void
    {
        $token = $this->loginAsAdmin();
        [$rfqId, $itemId, $ids] = $this->quotedRfq($token, $this->approvedPr($token), 'Equipment');

        foreach ($ids as $id) {
            $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers/{$id}/twg-check", ['items' => [['rfq_item_id' => $itemId, 'complies' => false]]])->assertOk();
        }

        $rfq = $this->withToken($token)->getJson("/api/v1/rfqs/{$rfqId}")->json('data');
        $this->assertSame('Canvassing', $rfq['status']);
        $this->assertSame(3, $rfq['open_supplier_slots']);
        $this->assertSame(['Failed TWG'], collect($rfq['suppliers'])->pluck('status')->unique()->values()->all());
        $this->assertDatabaseHas('user_notifications', ['type' => 'rfq_twg_all_failed']);
        // A supplier that already failed cannot be chosen again for this RFQ.
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers/choose", ['suppliers' => [['supplier_name' => 'ACME Trading']]])->assertStatus(422);

        $chosen = collect($this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers/choose", [
            'suppliers' => [['supplier_name' => 'New One'], ['supplier_name' => 'New Two'], ['supplier_name' => 'New Three']],
        ])->assertCreated()->json('data.suppliers'))->where('status', 'Sent')->pluck('id')->values();
        $this->assertCount(3, $chosen);
        foreach ($chosen as $i => $id) {
            $this->recordQuote($token, $rfqId, $id, [['rfq_item_id' => $itemId, 'unit_price' => 300 + $i]])->assertOk();
        }
        $this->withToken($token)->getJson("/api/v1/rfqs/{$rfqId}")->assertJsonPath('data.status', 'TWG Evaluation');
    }

    // --- Venue: individual rating -> summary of rating ---

    public function test_venues_are_rated_by_each_rater_and_the_top_rated_one_wins(): void
    {
        $admin = $this->loginAsAdmin();
        $prId = $this->approvedPr($admin, 'mdelacruz@dost.gov.ph');
        $rfqId = $this->signedRfq($admin, $prId, 'Venue');
        $ids = $this->sendTo($admin, $rfqId, ['Almont Inland Resort', 'Watergate Hotel', 'Balanghai Hotel']);
        $item = $this->itemIds($admin, $rfqId)[0];
        foreach ([30000, 25000, 28000] as $i => $price) {
            $this->recordQuote($admin, $rfqId, $ids[$i], [['rfq_item_id' => $item, 'unit_price' => $price]])->assertOk();
        }

        $aoc = $this->withToken($admin)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->assertJsonPath('data.status', 'For Venue Rating')->json('data');
        $criteria = $aoc['venue_rating']['criteria'];
        $this->assertCount(5, $criteria);
        // Admin is the TWG Lead and the Supply Officer; Maria is the end-user.
        $this->assertSame(['TWG Lead / Supply Officer', 'End-user'], collect($aoc['venue_rating']['raters'])->pluck('role')->all());

        $maria = $this->postJson('/api/v1/auth/login', ['email' => 'mdelacruz@dost.gov.ph', 'password' => 'password123'])->json('token');
        $this->withToken($maria)->getJson('/api/v1/aoc/my-venue-ratings')->assertOk()->assertJsonCount(1, 'data');
        $this->withToken($maria)->getJson("/api/v1/aoc/{$aoc['id']}")->assertOk()->assertJsonPath('data.venue_rating.my_turn', true);

        $scores = fn (array $byVenue) => collect($ids)->flatMap(fn ($id, $i) => collect($criteria)->map(fn ($c) => ['rfq_supplier_id' => $id, 'criterion' => $c, 'score' => $byVenue[$i]]))->values()->all();
        $this->withToken($maria)->postJson("/api/v1/aoc/{$aoc['id']}/venue-ratings", ['ratings' => array_slice($scores([5, 3, 4]), 1)])->assertStatus(422); // incomplete
        $this->withToken($maria)->postJson("/api/v1/aoc/{$aoc['id']}/venue-ratings", ['ratings' => $scores([5, 3, 4])])->assertOk()->assertJsonPath('data.status', 'For Venue Rating');
        $this->withToken($maria)->postJson("/api/v1/aoc/{$aoc['id']}/venue-ratings", ['ratings' => $scores([5, 3, 4])])->assertStatus(422); // once
        $this->asBac()->postJson("/api/v1/aoc/{$aoc['id']}/venue-ratings", ['ratings' => $scores([1, 1, 1])])->assertStatus(403); // not a rater

        $done = $this->withToken($admin)->postJson("/api/v1/aoc/{$aoc['id']}/venue-ratings", ['ratings' => $scores([4, 5, 4])])->assertOk()->json('data');
        $this->assertSame('Draft', $done['status']);
        // Averages: Almont 4.5, Watergate 4.0, Balanghai 4.0 -> Almont wins despite the highest price.
        $this->assertSame($ids[0], $done['winning_rfq_supplier_id']);
        $this->assertSame([1, 2, 3], collect($done['venue_rating']['summary'])->pluck('rank')->all());
        // Tie on 4.0: the lower quote (Watergate, 25,000) ranks above Balanghai.
        $this->assertSame('Watergate Hotel', $done['venue_rating']['summary'][1]['supplier_name']);

        $this->withToken($admin)->postJson("/api/v1/aoc/{$aoc['id']}/submit-for-bac-review")->assertOk();
    }

    // --- PO: the signed PO goes to the supplier through Supply, which records the supplier's answer ---

    /** Takes a fresh PR all the way to a fully signed PO released to Supply; returns [prId, poId]. */
    private function forwardedPo(string $token): array
    {
        $prId = $this->approvedPr($token);
        [$rfqId] = $this->quotedRfq($token, $prId);
        $this->notedAoc($token, $rfqId);
        $poId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/submit")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/obligate")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/account")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/po/{$poId}/final-approve")->assertOk()
            ->assertJsonPath('data.status', 'Forwarded to Supplier')
            ->assertJsonMissingPath('portal_link');

        return [$prId, $poId];
    }

    public function test_supply_records_that_the_supplier_will_deliver(): void
    {
        $token = $this->loginAsAdmin();
        Mail::fake();
        [$prId, $poId] = $this->forwardedPo($token);

        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/deliver", ['waived' => false])->assertOk()->assertJsonPath('data.status', 'Delivery Accepted');
        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/deliver", ['waived' => true, 'reason' => 'x'])->assertStatus(422); // answered already
        $this->assertSame('Approved', PurchaseRequest::find($prId)->status);
        $this->assertDatabaseHas('approval_actions', ['actionable_id' => $poId, 'role' => 'Supply', 'action' => 'Delivery Accepted']);
        // The end-user still hears who won; the supplier is never emailed.
        $this->assertDatabaseHas('user_notifications', ['type' => 'po_forwarded']);
        $this->getJson('/api/v1/portal/po/anything')->assertNotFound();
    }

    public function test_a_supplier_waiving_delivery_cancels_the_pr_for_a_re_pr(): void
    {
        $token = $this->loginAsAdmin();
        [$prId, $poId] = $this->forwardedPo($token);

        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/deliver", ['waived' => true])->assertStatus(422); // reason required
        $this->withToken($token)->postJson("/api/v1/purchase-orders/{$poId}/deliver", ['waived' => true, 'reason' => 'Out of stock.'])->assertOk()->assertJsonPath('data.status', 'Delivery Waived');

        $this->assertDatabaseHas('purchase_requests', ['id' => $prId, 'status' => 'Cancelled', 'cancelled_from' => 'PO']);
        $this->withToken($token)->postJson("/api/v1/purchase-requests/{$prId}/re-pr")->assertCreated()->assertJsonPath('data.status', 'Draft');
    }

    public function test_cancelling_a_pr_closes_its_open_canvass_links(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->approvedPr($token);
        [$rfqId] = $this->quotedRfq($token, $prId);
        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->json('data.id');
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => false, 'remarks' => 'Over the ABC.'])->assertOk();
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/twg-respond", ['response' => 'Rechecked.'])->assertOk();
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-satisfaction", ['satisfied' => false, 'reason' => 'Still over the ABC.'])->assertOk();

        $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'items' => [['description' => 'Item', 'uom' => 'unit', 'quantity' => 1]],
        ])->assertStatus(422); // a cancelled PR cannot start a new RFQ
        $this->assertSame(0, Supplier::where('active', false)->count());
    }
}
