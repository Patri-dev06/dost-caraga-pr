<?php

namespace Tests\Feature;

use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Concerns\SignsRfq;
use Tests\TestCase;

/** The printed Abstract of Canvas: the RFQ particulars and every signature line, BAC members included. */
class AocDocumentTest extends TestCase
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

    public function test_the_aoc_carries_what_its_printed_form_needs(): void
    {
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->json('token');
        $member = User::create([
            'name' => 'Rosa Member', 'email' => 'bac-member@dost.gov.ph', 'password' => bcrypt('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['rfq'], 'position' => 'Accountant III',
        ]);
        $member->roles()->sync([Role::where('name', 'BAC Member')->value('id')]);

        $prId = $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO', 'fund_source' => 'GAA 2026 - MOOE', 'mode_of_procurement' => 'Small Value Procurement',
            'purpose' => 'AOC print test.', 'submit' => true,
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ])->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();
        [$rfqId] = $this->quotedRfq($token, $prId);
        $aocId = $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');

        $doc = $this->withToken($token)->getJson("/api/v1/aoc/{$aocId}")->assertOk()->json('data.document');

        $this->assertSame('Small Value Procurement', $doc['mode_of_procurement']);
        $this->assertSame('AOC print test.', $doc['purpose']);
        $this->assertNotEmpty($doc['quotation_no']);
        $this->assertSame([['name' => 'Rosa Member', 'position' => 'Accountant III']], $doc['signatories']['bac_members']);
        $this->assertNotNull($doc['signatories']['bac_chair']);
        $this->assertNotNull($doc['signatories']['regional_director']);
        $this->assertNull($doc['signatories']['twg_lead']); // only for equipment
    }
}
