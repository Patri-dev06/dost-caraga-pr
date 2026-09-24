<?php

namespace Tests\Feature\Concerns;

use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;

/**
 * Walks an RFQ through the flowchart's green and orange lanes as the seeded, designated accounts:
 * Supply Officer counter-sign -> BAC Chair/Vice-Chair sign -> 3 suppliers -> send -> signed quotes
 * -> AOC -> BAC review -> Supply notes the lowest bidder.
 */
trait SignsRfq
{
    /** Seeded account designated for each RFQ signing step (see DatabaseSeeder / BacUsersSeeder). */
    private const RFQ_SIGNATORY_EMAILS = [
        'supply-officer' => 'admin@dost.gov.ph',
        'bac' => 'jbautista.bac@dost.gov.ph',
        'bac-chair' => 'jbautista.bac@dost.gov.ph',
        'bac-vice-chair' => 'rsantiago.bac@dost.gov.ph',
    ];

    /** A request acting as the designated BAC 'chair' or 'vice-chair' (the only accounts allowed to review an AOC). */
    private function asBac(string $who = 'chair'): static
    {
        return $this->asEmail(self::RFQ_SIGNATORY_EMAILS[$who === 'chair' ? 'bac-chair' : 'bac-vice-chair']);
    }

    private function asEmail(string $email): static
    {
        $token = $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'password123'])->json('token');

        return $this->withToken($token);
    }

    /** Signs one RFQ step ('supply-officer' or 'bac') as the account designated for it ('bac-vice-chair' signs the BAC step as the Vice-Chair). */
    private function signRfq(int $rfqId, string $step): TestResponse
    {
        $path = in_array($step, ['bac', 'bac-chair', 'bac-vice-chair'], true) ? 'bac' : $step;

        return $this->asEmail(self::RFQ_SIGNATORY_EMAILS[$step])->postJson("/api/v1/rfqs/{$rfqId}/sign/{$path}");
    }

    /** Flowchart order: Supply Officer counter-sign, then one BAC signature. */
    private function completeRfqSigning(int $rfqId): void
    {
        $this->signRfq($rfqId, 'supply-officer')->assertOk()->assertJsonPath('data.status', 'Pending BAC Signature');
        $this->signRfq($rfqId, 'bac')->assertOk()->assertJsonPath('data.status', 'Ready to Send');
    }

    private function addSuppliers(string $token, int $rfqId, array $names = ['ACME Trading', 'Bayanihan Supplies', 'Caraga Merchants']): void
    {
        foreach ($names as $name) {
            $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/suppliers", [
                'supplier_name' => $name,
                'supplier_email' => strtolower(str_replace(' ', '', $name)).'@example.com',
            ])->assertCreated();
        }
    }

    /** Staff-recorded quotation: prices per item plus the scanned signed quotation. */
    private function recordQuote(string $token, int $rfqId, int|string $rfqSupplierId, array $items): TestResponse
    {
        return $this->withToken($token)->withHeaders(['Accept' => 'application/json'])->post(
            "/api/v1/rfqs/{$rfqId}/suppliers/{$rfqSupplierId}/quote",
            ['items' => $items, 'quotation' => UploadedFile::fake()->create('signed-quotation.pdf', 40, 'application/pdf')],
        );
    }

    /**
     * Signs, canvasses 3 suppliers, sends, and records a quote from each (prices $base, $base+$step, …).
     *
     * @return array{0: int, 1: int, 2: array<int, int>} [rfqId, rfqItemId, rfqSupplierIds]
     */
    private function quotedRfq(string $token, int $prId, string $category = 'Goods', float $base = 240, float $step = 1): array
    {
        $rfqId = $this->withToken($token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId,
            'procurement_category' => $category,
            'canvasser' => 'Juan Dela Cruz',
            'items' => [['description' => 'Canvassed item', 'uom' => 'unit', 'quantity' => 1, 'unit_abc' => 300, 'total_abc' => 300]],
        ])->assertCreated()->json('data.id');

        $this->completeRfqSigning($rfqId);
        $this->addSuppliers($token, $rfqId);
        $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/send")->assertOk();

        $rfq = $this->withToken($token)->getJson("/api/v1/rfqs/{$rfqId}")->json('data');
        $rfqItemId = $rfq['items'][0]['id'];
        $supplierIds = collect($rfq['suppliers'])->pluck('id')->all();
        foreach ($supplierIds as $i => $supplierId) {
            $this->recordQuote($token, $rfqId, $supplierId, [['rfq_item_id' => $rfqItemId, 'unit_price' => $base + ($i * $step)]])->assertOk();
        }

        return [$rfqId, $rfqItemId, $supplierIds];
    }

    /** Generates the AOC, has the BAC pass it, and has Supply note the lowest bidder; returns the AOC id. */
    private function notedAoc(string $token, int $rfqId): int
    {
        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => true])->assertOk()->assertJsonPath('data.status', 'For Supply Noting');
        $this->asEmail(self::RFQ_SIGNATORY_EMAILS['supply-officer'])->postJson("/api/v1/aoc/{$aocId}/note-lowest-bidder")
            ->assertOk()->assertJsonPath('data.status', 'Lowest Bidder Noted');

        return $aocId;
    }
}
