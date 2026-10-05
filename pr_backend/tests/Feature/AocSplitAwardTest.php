<?php

namespace Tests\Feature;

use App\Models\RfqQuoteItem;
use App\Models\RfqSupplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Concerns\SignsRfq;
use Tests\TestCase;

/**
 * The Abstract of Canvass awards line by line, which is how the office's own form reads: one canvass
 * splits its items across every supplier that quoted, and each winning supplier gets its own PO.
 *
 * The fixture mirrors a real AOC (PR 2026-08-762), using catalogue items the APP check accepts:
 *
 *   Item           COMPAÑERO   KIMSON              LG        Awarded to
 *   1 WiFi Router     NONE     150 non-compliant   200       LG  (the cheaper quote fails the spec)
 *   2 Bond Paper       35       45                 100       COMPAÑERO
 *   3 Office Chair    NONE     850                1000       KIMSON
 */
class AocSplitAwardTest extends TestCase
{
    use RefreshDatabase;
    use SignsRfq;

    protected bool $seed = true;

    private const SUPPLIERS = ['Compañero Commercial', 'Kimson Commercial', 'LG Supplies'];

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function loginAsAdmin(): string
    {
        return $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    /** An approved PR with three lines, then an RFQ canvassed to the three suppliers above. */
    private function canvassedRfq(string $token, string $category = 'Goods'): array
    {
        $prId = $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Supplies and materials for the project SCALEUP.',
            'submit' => true,
            'items' => [
                ['name' => 'WiFi Router', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 200],
                ['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 100],
                ['name' => 'Office Chair, Mid-back', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 1000],
            ],
        ])->assertCreated()->json('data.id');

        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();

        $rfqId = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'procurement_category' => $category,
            'canvasser' => 'Juan Dela Cruz',
            'items' => [
                ['description' => 'WiFi Router', 'uom' => 'unit', 'quantity' => 1, 'unit_abc' => 200, 'total_abc' => 200],
                ['description' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_abc' => 100, 'total_abc' => 100],
                ['description' => 'Office Chair, Mid-back', 'uom' => 'unit', 'quantity' => 1, 'unit_abc' => 1000, 'total_abc' => 1000],
            ],
        ])->assertCreated()->json('data.id');

        $this->addSuppliers($token, $rfqId, self::SUPPLIERS);
        $this->completeRfqSigning($rfqId);
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/send")->assertOk();

        $rfq = $this->withToken($token)->getJson("/api/v1/rfqs/{$rfqId}")->json('data');
        [$router, $paper, $chair] = collect($rfq['items'])->pluck('id')->all();
        $supplierIds = collect($rfq['suppliers'])->pluck('id')->all();

        // NONE is a null unit price: the supplier did not offer that line at all.
        $prices = [
            [[$router, null], [$paper, 35], [$chair, null]],
            [[$router, 150], [$paper, 45], [$chair, 850]],
            [[$router, 200], [$paper, 100], [$chair, 1000]],
        ];
        foreach ($supplierIds as $i => $supplierId) {
            $this->recordQuote($token, $rfqId, $supplierId, collect($prices[$i])
                ->map(fn (array $p) => ['rfq_item_id' => $p[0], 'unit_price' => $p[1]])->all())->assertOk();
        }

        return [$prId, $rfqId, compact('router', 'paper', 'chair'), $supplierIds];
    }

    public function test_a_supplier_may_quote_none_for_an_item_it_does_not_offer(): void
    {
        $token = $this->loginAsAdmin();
        [, $rfqId, $items, $supplierIds] = $this->canvassedRfq($token);

        $rfq = $this->withToken($token)->getJson("/api/v1/rfqs/{$rfqId}")->assertOk()->json('data');
        $companero = collect($rfq['suppliers'])->firstWhere('id', $supplierIds[0]);
        $routerQuote = collect($companero['quote_items'])->firstWhere('rfq_item_id', $items['router']);

        $this->assertNull($routerQuote['unit_price'], 'A line the supplier did not offer is stored as NONE, not zero.');
    }

    public function test_each_item_is_awarded_to_its_own_lowest_compliant_supplier(): void
    {
        $token = $this->loginAsAdmin();
        [, $rfqId, $items, $supplierIds] = $this->canvassedRfq($token);
        [$companero, $kimson, $lg] = $supplierIds;

        // The TWG marks Kimson's ₱150 router non-compliant, so it is passed over for LG's ₱200.
        RfqQuoteItem::where('rfq_supplier_id', $kimson)->where('rfq_item_id', $items['router'])
            ->update(['twg_complies' => false, 'twg_remarks' => '1.5 meters only']);

        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
        $aoc = $this->withToken($token)->getJson("/api/v1/aoc/{$aocId}")->assertOk()->json('data');

        $awardedTo = fn (int $itemId) => collect($aoc['suppliers'])
            ->first(fn (array $s) => collect($s['quote_items'])
                ->contains(fn (array $qi) => $qi['rfq_item_id'] === $itemId && $qi['is_awarded']))['id'] ?? null;

        $this->assertSame($lg, $awardedTo($items['router']), 'The cheaper non-compliant router is passed over.');
        $this->assertSame($companero, $awardedTo($items['paper']));
        $this->assertSame($kimson, $awardedTo($items['chair']));
    }

    public function test_the_printed_document_groups_the_award_by_supplier_and_names_the_passed_over_quote(): void
    {
        $token = $this->loginAsAdmin();
        [, $rfqId, $items, $supplierIds] = $this->canvassedRfq($token);

        RfqQuoteItem::where('rfq_supplier_id', $supplierIds[1])->where('rfq_item_id', $items['router'])
            ->update(['twg_complies' => false, 'twg_remarks' => 'Single-band only']);

        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
        $summary = $this->withToken($token)->getJson("/api/v1/aoc/{$aocId}")->assertOk()->json('data.document.award_summary');

        // One recommendation line per supplier, each naming only the items it won.
        $byName = collect($summary['awards'])->pluck('item_nos', 'supplier_name')->all();
        $this->assertSame([2], $byName['Compañero Commercial']);
        $this->assertSame([3], $byName['Kimson Commercial']);
        $this->assertSame([1], $byName['LG Supplies']);

        $this->assertSame(
            ['Item No. 1 offered by KIMSON COMMERCIAL is non-compliant (Single-band only).'],
            $summary['non_compliant'],
        );
    }

    /**
     * Equipment: a dealer that misses the specification on one item used to be thrown out of the
     * canvass entirely. It now keeps the items it did meet — on the sample form Kimson is
     * non-compliant on item 1 and still wins seventeen others.
     */
    public function test_equipment_dealer_failing_one_item_still_wins_the_items_it_met(): void
    {
        $token = $this->loginAsAdmin();
        [, $rfqId, $items, $supplierIds] = $this->canvassedRfq($token, 'Equipment');
        [$companero, $kimson] = $supplierIds;

        $this->withToken($token)->putJson("/api/v1/rfqs/{$rfqId}/twg/notes", ['notes' => 'Specifications checked against the PR.'])->assertOk();

        // Kimson misses the router's specification but meets the other two.
        $check = fn (int $supplierId, array $complies) => $this->withToken($token)
            ->postJson("/api/v1/rfqs/{$rfqId}/suppliers/{$supplierId}/twg-check", ['items' => [
                ['rfq_item_id' => $items['router'], 'complies' => $complies[0], 'remarks' => $complies[0] ? null : 'Single-band only'],
                ['rfq_item_id' => $items['paper'], 'complies' => $complies[1]],
                ['rfq_item_id' => $items['chair'], 'complies' => $complies[2]],
            ]])->assertOk();

        $check($companero, [true, true, true]);
        $check($kimson, [false, true, true]);
        $check($supplierIds[2], [true, true, true]);

        $this->assertSame('Partial', RfqSupplier::find($kimson)->twg_result);

        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
        $aoc = $this->withToken($token)->getJson("/api/v1/aoc/{$aocId}")->assertOk()->json('data');

        $kimsonItems = collect($aoc['suppliers'])->firstWhere('id', $kimson)['quote_items'];
        $awarded = collect($kimsonItems)->filter(fn (array $qi) => $qi['is_awarded'])->pluck('rfq_item_id');

        $this->assertTrue($awarded->contains($items['chair']), 'Kimson keeps the chair it quoted lowest and met.');
        $this->assertFalse($awarded->contains($items['router']), 'But not the line it failed.');
    }

    public function test_a_split_award_generates_one_purchase_order_per_winning_supplier(): void
    {
        $token = $this->loginAsAdmin();
        [$prId, $rfqId, $items, $supplierIds] = $this->canvassedRfq($token);

        // As on the sample form: Kimson's cheaper router fails the spec, so the line goes to LG and
        // all three suppliers end up holding one item each.
        RfqQuoteItem::where('rfq_supplier_id', $supplierIds[1])->where('rfq_item_id', $items['router'])
            ->update(['twg_complies' => false, 'twg_remarks' => 'Single-band only']);

        $this->notedAoc($token, $rfqId);

        $pos = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertCreated()->json('data');

        // Compañero wins the paper, Kimson the chair, LG the router — three contracts, three POs.
        $this->assertCount(3, $pos);
        $this->assertEqualsCanonicalizing(self::SUPPLIERS, collect($pos)->pluck('supplier_name')->all());

        foreach ($pos as $po) {
            $this->assertCount(1, $po['items'], 'Each PO carries only the lines that supplier won.');
            $this->assertSame($prId, $po['purchase_request_id']);
        }

        $this->assertSame(
            ['Compañero Commercial' => '35.00', 'Kimson Commercial' => '850.00', 'LG Supplies' => '200.00'],
            collect($pos)->sortBy('supplier_name')->pluck('total_amount', 'supplier_name')->all(),
        );
    }

    public function test_supply_may_reassign_an_item_to_another_supplier_before_bac_review(): void
    {
        $token = $this->loginAsAdmin();
        [, $rfqId, $items, $supplierIds] = $this->canvassedRfq($token);
        [, $kimson] = $supplierIds;

        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');

        // The paper goes to Kimson on delivery terms even though Compañero quoted lower.
        $aoc = $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/awards", [
            'awards' => [['rfq_item_id' => $items['paper'], 'rfq_supplier_id' => $kimson, 'remarks' => 'Compañero cannot deliver within 30 days.']],
        ])->assertOk()->json('data');

        $paperAward = collect($aoc['suppliers'])->firstWhere('id', $kimson)['quote_items'];
        $this->assertTrue(collect($paperAward)->firstWhere('rfq_item_id', $items['paper'])['is_awarded']);

        // ...and no one else still holds it.
        $holders = collect($aoc['suppliers'])->filter(fn (array $s) => collect($s['quote_items'])
            ->contains(fn (array $qi) => $qi['rfq_item_id'] === $items['paper'] && $qi['is_awarded']));
        $this->assertCount(1, $holders);
    }

    public function test_an_item_cannot_be_awarded_to_a_supplier_that_did_not_quote_it(): void
    {
        $token = $this->loginAsAdmin();
        [, $rfqId, $items, $supplierIds] = $this->canvassedRfq($token);

        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');

        // Compañero quoted NONE for the router, so it cannot win it.
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/awards", [
            'awards' => [['rfq_item_id' => $items['router'], 'rfq_supplier_id' => $supplierIds[0]]],
        ])->assertStatus(422);
    }
}
