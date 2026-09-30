<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** The official RFQ form's per-request parts: the documents asked of suppliers, and the FOB/VAT notes. */
class RfqFormFieldsTest extends TestCase
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

    private function approvedPr(): int
    {
        $prId = $this->withToken($this->token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO', 'fund_source' => 'GAA 2026 - MOOE', 'mode_of_procurement' => 'Shopping',
            'purpose' => 'RFQ form test.', 'submit' => true,
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ])->assertCreated()->json('data.id');
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();

        return $prId;
    }

    private function rfq(array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->withToken($this->token)->postJson('/api/v1/rfqs', $extra + [
            'purchase_request_id' => $this->approvedPr(),
            'items' => [['description' => 'Bond paper', 'uom' => 'ream', 'quantity' => 1, 'unit_abc' => 250, 'total_abc' => 250]],
        ]);
    }

    public function test_an_rfq_defaults_to_the_standard_three_documents(): void
    {
        $this->rfq()->assertCreated()->assertJsonPath('data.required_documents', [
            'Valid PhilGEPS Registration', "Valid Mayor's / Business Permit", 'Tax Clearance Certificate',
        ]);
    }

    public function test_an_rfq_can_ask_for_other_documents_none_and_carry_fob_notes(): void
    {
        $id = $this->rfq([
            'required_documents' => ['Valid PhilGEPS Registration; Platinum Membership', ' Omnibus Sworn Statement (OSS) ', ''],
            'notes' => "FOB (for all items): DOST-SDN Satellite Office, SNSU-Del Carmen Campus\nVAT Inclusive for all items",
        ])->assertCreated()
            ->assertJsonPath('data.required_documents', ['Valid PhilGEPS Registration; Platinum Membership', 'Omnibus Sworn Statement (OSS)'])
            ->assertJsonPath('data.notes', "FOB (for all items): DOST-SDN Satellite Office, SNSU-Del Carmen Campus\nVAT Inclusive for all items")
            ->json('data.id');

        // "May we have your quotation on or before the scheduled opening of bids." — no documents at all.
        $this->withToken($this->token)->putJson("/api/v1/rfqs/{$id}", ['required_documents' => []])->assertOk()
            ->assertJsonPath('data.required_documents', []);
    }
}
