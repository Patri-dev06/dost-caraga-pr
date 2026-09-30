<?php

namespace Tests\Feature;

use App\Models\PurchaseRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** PR numbers follow the Supply Unit's year-month-sequence format; the RFQ's Quotation No. follows from it. */
class PrNumberingTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function newPr(): PurchaseRequest
    {
        // Sign in at the (test) time: moving the clock forward would otherwise expire the token.
        $this->token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->json('token');
        $id = $this->withToken($this->token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO', 'fund_source' => 'GAA 2026 - MOOE', 'mode_of_procurement' => 'Shopping', 'purpose' => 'Numbering test.',
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ])->assertCreated()->json('data.id');

        return PurchaseRequest::find($id);
    }

    public function test_pr_numbers_are_year_month_sequence_running_through_the_year(): void
    {
        PurchaseRequest::query()->delete();
        // Older numbering from earlier this year: the sequence carries on from its highest number.
        PurchaseRequest::forceCreate(['pr_no' => 'PR-2026-0713', 'office_id' => \App\Models\Office::first()->id, 'fund_source_id' => \App\Models\FundSource::first()->id, 'mode_of_procurement' => 'Shopping', 'purpose' => 'Old.', 'status' => 'Draft']);

        Carbon::setTestNow('2026-08-05 09:00:00');
        $this->assertSame('2026-08-714', $this->newPr()->pr_no);

        // A new month keeps the running sequence; the month part changes.
        Carbon::setTestNow('2026-09-01 09:00:00');
        $this->assertSame('2026-09-715', $this->newPr()->pr_no);

        // A new year starts again at 001.
        Carbon::setTestNow('2027-01-04 09:00:00');
        $this->assertSame('2027-01-001', $this->newPr()->pr_no);
    }

    public function test_an_rfq_quotation_number_defaults_from_the_pr_number(): void
    {
        Carbon::setTestNow('2026-08-05 09:00:00');
        PurchaseRequest::query()->delete();
        $pr = $this->newPr();
        $this->withToken($this->token)->postJson("/api/v1/purchase-requests/{$pr->id}/submit")->assertOk();
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$pr->id}/recommend")->assertOk();
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$pr->id}/approve")->assertOk();

        $this->withToken($this->token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $pr->id,
            'items' => [['description' => 'Bond paper', 'uom' => 'ream', 'quantity' => 1, 'unit_abc' => 250, 'total_abc' => 250]],
        ])->assertCreated()->assertJsonPath('data.quotation_no', '1-2026');

        $this->assertSame('714-2026', \App\Http\Controllers\Api\RfqController::quotationNoFor('2026-08-714'));
        $this->assertSame('142-2026', \App\Http\Controllers\Api\RfqController::quotationNoFor('PR-2026-0142'));
    }
}
