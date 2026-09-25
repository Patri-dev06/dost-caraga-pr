<?php

namespace Tests\Feature;

use App\Models\LibDocument;
use App\Models\LibDocumentRow;
use App\Models\Office;
use App\Models\PpmpDocument;
use App\Models\PpmpItem;
use App\Models\ProcurementItem;
use App\Models\Project;
use App\Models\PurchaseRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** A PR's Supplementary Documents (PPMP + LIB) are attached, frozen, when it is submitted. */
class PrSupportingDocumentsTest extends TestCase
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

    /** An approved Project PPMP (Mini PC line, ₱30,000) backed by an approved LIB with two rows. */
    private function projectPpmp(): PpmpDocument
    {
        $lib = LibDocument::create(['client_uid' => 'lib-'.uniqid(), 'fiscal_year' => '2026', 'project_title' => 'NOVA AI Hub', 'status' => 'Approved']);
        LibDocumentRow::create(['lib_document_id' => $lib->id, 'client_uid' => 'r1', 'label' => 'Equipment Outlay', 'header' => true, 'indent' => 0, 'approved' => '', 'sort_order' => 1]);
        LibDocumentRow::create(['lib_document_id' => $lib->id, 'client_uid' => 'r2', 'label' => 'ICT Equipment', 'header' => false, 'indent' => 1, 'approved' => '120,000.00', 'sort_order' => 2]);

        $ppmp = PpmpDocument::create([
            'client_uid' => 'ppmp-'.uniqid(), 'project_id' => Project::first()->id, 'lib_document_id' => $lib->id,
            'ppmp_no' => 'PPMP-2026-9001', 'fiscal_year' => 2026, 'status' => 'Approved', 'ppmp_class' => 'Project',
        ]);
        $item = ProcurementItem::firstOrCreate(['name' => 'Mini PC for Kiosk'], ['uom' => 'unit', 'category' => 'ICT Supplies']);
        PpmpItem::create([
            'ppmp_document_id' => $ppmp->id, 'project_id' => $ppmp->project_id, 'procurement_item_id' => $item->id,
            'item_name' => 'Mini PC for Kiosk', 'expense_category' => 'ICT Supplies', 'quantity' => 10,
            'estimated_unit_cost' => 3000, 'estimated_budget' => 30000,
        ]);

        return $ppmp;
    }

    private function draftPr(PpmpDocument $ppmp): int
    {
        return $this->withToken($this->token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO', 'fund_source' => 'Trust Fund - SETUP', 'mode_of_procurement' => 'Shopping',
            'purpose' => 'Kiosk units.', 'ppmp_client_uid' => $ppmp->client_uid,
            'items' => [['name' => 'Mini PC for Kiosk', 'uom' => 'unit', 'quantity' => 2, 'unit_cost' => 12000]],
        ])->assertCreated()->json('data.id');
    }

    private function supportingDocuments(int $prId, ?string $token = null): \Illuminate\Testing\TestResponse
    {
        return $this->withToken($token ?? $this->token)->getJson("/api/v1/purchase-requests/{$prId}/supporting-documents");
    }

    public function test_submitting_a_pr_attaches_its_ppmp_and_lib_as_frozen_copies(): void
    {
        $ppmp = $this->projectPpmp();
        $prId = $this->draftPr($ppmp);
        $this->assertSame([], $this->supportingDocuments($prId)->assertOk()->json('data'));

        $this->withToken($this->token)->postJson("/api/v1/purchase-requests/{$prId}/submit")->assertOk()
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'PPMP and LIB attached'));

        $documents = collect($this->supportingDocuments($prId)->assertOk()->json('data'))->keyBy('type');
        $this->assertSame(['PPMP', 'LIB'], $documents->keys()->all());
        $this->assertSame('PPMP PPMP-2026-9001', $documents['PPMP']['reference']);
        $this->assertEquals(30000, $documents['PPMP']['total']);
        $this->assertSame('Mini PC for Kiosk', $documents['PPMP']['snapshot']['items'][0]['item_name']);
        $this->assertSame('NOVA AI Hub', $documents['LIB']['title']);
        $this->assertEquals(120000, $documents['LIB']['total']);
        $this->assertSame('Line-Item Budget', $documents['LIB']['type_label']);

        // The copy is frozen: a later change to the PPMP does not rewrite what the PR was filed with.
        PpmpItem::where('ppmp_document_id', $ppmp->id)->update(['estimated_budget' => 99000]);
        $this->assertEquals(30000, collect($this->supportingDocuments($prId)->json('data'))->firstWhere('type', 'PPMP')['total']);

        // The monitoring sheet's "SD Attached" column fills itself in.
        $row = collect($this->withToken($this->token)->getJson('/api/v1/purchase-requests/monitoring?per_page=100')->json('data'))->firstWhere('pr_id', $prId);
        $this->assertSame('PPMP, LIB', $row['sd_attached']);
    }

    public function test_resubmitting_after_a_return_attaches_the_current_versions(): void
    {
        $ppmp = $this->projectPpmp();
        $prId = $this->draftPr($ppmp);
        $this->withToken($this->token)->postJson("/api/v1/purchase-requests/{$prId}/submit")->assertOk();

        PurchaseRequest::whereKey($prId)->update(['status' => 'Returned']);
        PpmpItem::where('ppmp_document_id', $ppmp->id)->update(['estimated_budget' => 45000]);
        $this->withToken($this->token)->postJson("/api/v1/purchase-requests/{$prId}/submit")->assertOk();

        $documents = collect($this->supportingDocuments($prId)->json('data'));
        $this->assertCount(2, $documents);
        $this->assertEquals(45000, $documents->firstWhere('type', 'PPMP')['total']);
    }

    public function test_only_people_who_can_see_the_pr_can_read_its_supporting_documents(): void
    {
        $prId = $this->draftPr($this->projectPpmp());
        $this->withToken($this->token)->postJson("/api/v1/purchase-requests/{$prId}/submit")->assertOk();

        $other = User::create([
            'name' => 'Other Employee', 'email' => 'sd-other@dost.gov.ph', 'password' => bcrypt('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr'],
        ]);
        $otherToken = $this->postJson('/api/v1/auth/login', ['email' => $other->email, 'password' => 'password123'])->json('token');
        $this->supportingDocuments($prId, $otherToken)->assertNotFound();

        // An approver (Approval Inbox holder) reads them, though the PPMP/LIB are not theirs.
        $other->update(['modules' => ['pr', 'approvals']]);
        $this->assertCount(2, $this->supportingDocuments($prId, $otherToken)->assertOk()->json('data'));
    }

    public function test_submitting_straight_from_the_create_form_also_attaches_them(): void
    {
        $ppmp = $this->projectPpmp();
        $prId = $this->withToken($this->token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO', 'fund_source' => 'Trust Fund - SETUP', 'mode_of_procurement' => 'Shopping',
            'purpose' => 'Kiosk units.', 'ppmp_client_uid' => $ppmp->client_uid, 'submit' => true,
            'items' => [['name' => 'Mini PC for Kiosk', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 12000]],
        ])->assertCreated()->assertJsonPath('data.status', 'For Recommendation')->json('data.id');

        $this->assertSame(['PPMP', 'LIB'], collect($this->supportingDocuments($prId)->json('data'))->pluck('type')->all());
    }
}
