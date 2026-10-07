<?php

namespace Tests\Feature;

use App\Models\LibDocument;
use App\Models\Office;
use App\Models\PurchaseRequest;
use App\Models\SignedCopy;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Concerns\SignsRfq;
use Tests\TestCase;

/**
 * Signatures are wet: each document's final signing step goes through only with the scan of the
 * signed copy attached — by the signatory, or by the Supply team on their behalf.
 */
class SignedCopyTest extends TestCase
{
    use RefreshDatabase;
    use SignsRfq;

    protected bool $seed = true;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Mail::fake();
        $this->token = $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    /** The real-use setting: on. (The rest of the suite runs the signing steps without a scan.) */
    private function requireScans(bool $on = true): void
    {
        config(['features.signed_copy_required' => $on]);
    }

    private function scan(string $name = 'signed.pdf'): UploadedFile
    {
        return UploadedFile::fake()->create($name, 120, 'application/pdf');
    }

    /** A multipart POST, as the browser sends the scan. */
    private function postWithScan(string $token, string $url, array $data = [], ?UploadedFile $scan = null): TestResponse
    {
        return $this->withToken($token)->withHeaders(['Accept' => 'application/json'])
            ->post($url, $data + ($scan ? ['signed_copy' => $scan] : []));
    }

    /** A Supply team member (RFQ/PO module) who is none of the designated signatories. */
    private function supplyToken(): string
    {
        User::create([
            'name' => 'Ana Supply', 'email' => 'ana.supply@dost.gov.ph', 'password' => Hash::make('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr', 'rfq', 'po'],
        ]);

        return $this->postJson('/api/v1/auth/login', ['email' => 'ana.supply@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    private function outsiderToken(): string
    {
        User::create([
            'name' => 'Ola Outsider', 'email' => 'ola@dost.gov.ph', 'password' => Hash::make('password123'),
            'office_id' => Office::first()->id, 'status' => 'Active', 'tier' => 'regular', 'modules' => ['pr'],
        ]);

        return $this->postJson('/api/v1/auth/login', ['email' => 'ola@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    /** A PR recommended and waiting on the Regional Director. */
    private function prForApproval(): int
    {
        $prId = $this->withToken($this->token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO', 'fund_source' => 'GAA 2026 - MOOE', 'project_code' => 'PROJ-2026-001',
            'mode_of_procurement' => 'Shopping', 'purpose' => 'Signed copy test.', 'submit' => true,
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ])->assertCreated()->json('data.id');
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();

        return $prId;
    }

    public function test_the_rd_approves_a_pr_only_with_the_signed_copy_attached(): void
    {
        $this->requireScans();
        $prId = $this->prForApproval();

        $this->postWithScan($this->token, "/api/v1/approvals/{$prId}/approve")
            ->assertStatus(422)->assertJsonValidationErrors('signed_copy');
        $this->assertSame('For Approval', PurchaseRequest::find($prId)->status);

        $this->postWithScan($this->token, "/api/v1/approvals/{$prId}/approve", [], UploadedFile::fake()->create('notes.docx', 10))
            ->assertStatus(422)->assertJsonValidationErrors('signed_copy');

        $this->postWithScan($this->token, "/api/v1/approvals/{$prId}/approve", [], $this->scan('PR signed.pdf'))
            ->assertOk()
            ->assertJsonPath('data.status', 'Approved')
            ->assertJsonPath('data.signed_copies.0.step', 'pr_approved')
            ->assertJsonPath('data.signed_copies.0.on_behalf', false)
            ->assertJsonPath('data.signed_copies.0.original_name', 'PR signed.pdf');

        $copy = SignedCopy::sole();
        Storage::disk('local')->assertExists($copy->path);
        $this->withToken($this->token)->get("/api/v1/signed-copies/{$copy->id}")->assertOk()->assertDownload('PR signed.pdf');
        // Someone who cannot see the PR cannot download its scan.
        $this->withToken($this->outsiderToken())->getJson("/api/v1/signed-copies/{$copy->id}")->assertNotFound();
    }

    public function test_supply_may_upload_the_signed_pr_for_the_rd_and_it_is_recorded_as_such(): void
    {
        $this->requireScans();
        $prId = $this->prForApproval();

        $this->postWithScan($this->outsiderToken(), "/api/v1/approvals/{$prId}/approve", [], $this->scan())->assertForbidden();

        $this->postWithScan($this->supplyToken(), "/api/v1/approvals/{$prId}/approve", [], $this->scan())
            ->assertOk()
            ->assertJsonPath('data.status', 'Approved')
            ->assertJsonPath('data.signed_copies.0.on_behalf', true)
            ->assertJsonPath('data.signed_copies.0.uploaded_by', 'Ana Supply');

        $trail = $this->withToken($this->token)->getJson("/api/v1/purchase-requests/{$prId}")->json('data.approval_trail');
        $this->assertStringContainsString('Signed copy uploaded by Ana Supply for the Regional Director', end($trail)['remarks']);
    }

    public function test_supply_signs_the_rfq_for_the_bac_member_who_signed_it_on_paper(): void
    {
        $prId = $this->prForApproval();
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();
        $rfqId = $this->withToken($this->token)->postJson('/api/v1/rfqs', [
            'purchase_request_id' => $prId, 'procurement_category' => 'Goods', 'canvasser' => 'Juan Dela Cruz',
            'items' => [['description' => 'Item', 'uom' => 'unit', 'quantity' => 1, 'unit_abc' => 300, 'total_abc' => 300]],
        ])->assertCreated()->json('data.id');
        $this->addSuppliers($this->token, $rfqId);

        $this->requireScans();
        $supply = $this->supplyToken();
        $this->postWithScan($supply, "/api/v1/rfqs/{$rfqId}/sign/bac")->assertStatus(422);
        $this->postWithScan($supply, "/api/v1/rfqs/{$rfqId}/sign/bac", [], $this->scan())->assertStatus(422)->assertJsonValidationErrors('signed_by');

        $vice = User::where('email', self::RFQ_SIGNATORY_EMAILS['bac-vice-chair'])->first();
        $this->postWithScan($supply, "/api/v1/rfqs/{$rfqId}/sign/bac", ['signed_by' => 'vice'], $this->scan())
            ->assertOk()
            ->assertJsonPath('data.status', 'Ready to Send')
            ->assertJsonPath('data.bac_signed_name', $vice->name)
            ->assertJsonPath('data.bac_signed_role', 'BAC Vice-Chairman')
            ->assertJsonPath('data.signed_copies.0.step', 'rfq_signed');
    }

    public function test_the_aoc_and_po_need_their_scans_and_the_pr_lists_every_scan(): void
    {
        $prId = $this->prForApproval();
        $this->withToken($this->token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();
        [$rfqId] = $this->quotedRfq($this->token, $prId);
        $aocId = $this->withToken($this->token)->postJson("/api/v1/rfqs/{$rfqId}/aoc")->assertCreated()->json('data.id');
        $this->withToken($this->token)->postJson("/api/v1/aoc/{$aocId}/submit-for-bac-review")->assertOk();

        $this->requireScans();
        $supply = $this->supplyToken();
        // Supply may pass it for the BAC with the scan, but never return it with remarks.
        $this->postWithScan($supply, "/api/v1/aoc/{$aocId}/bac-review", ['pass' => 0, 'remarks' => 'x'])->assertForbidden();
        $this->asBac()->postJson("/api/v1/aoc/{$aocId}/bac-review", ['pass' => true])->assertStatus(422);
        $this->postWithScan($supply, "/api/v1/aoc/{$aocId}/bac-review", ['pass' => 1], $this->scan('AOC.pdf'))
            ->assertOk()->assertJsonPath('data.status', 'For Supply Noting')->assertJsonPath('data.signed_copies.0.on_behalf', true);

        $this->asEmail(self::RFQ_SIGNATORY_EMAILS['supply-officer'])->postJson("/api/v1/aoc/{$aocId}/note-lowest-bidder")->assertOk();
        $poId = $this->withToken($this->token)->postJson("/api/v1/rfqs/{$rfqId}/generate-po")->assertOk()->json('data.id');
        $this->withToken($this->token)->postJson("/api/v1/purchase-orders/{$poId}/submit")->assertOk();
        // The Budget and Accounting signatures stay plain clicks, and stay theirs alone.
        $this->withToken($supply)->postJson("/api/v1/approvals/po/{$poId}/obligate")->assertForbidden();
        $this->withToken($this->token)->postJson("/api/v1/approvals/po/{$poId}/obligate")->assertOk();
        $this->withToken($this->token)->postJson("/api/v1/approvals/po/{$poId}/account")->assertOk();

        $this->withToken($this->token)->postJson("/api/v1/approvals/po/{$poId}/final-approve")->assertStatus(422);
        $rd = User::where('email', 'admin@dost.gov.ph')->first();
        $this->postWithScan($supply, "/api/v1/approvals/po/{$poId}/final-approve", [], $this->scan('PO.pdf'))
            ->assertOk()
            ->assertJsonPath('data.approved_by_name', $rd->name)
            ->assertJsonPath('data.signed_copies.0.step', 'po_approved');

        $listed = collect($this->withToken($this->token)->getJson("/api/v1/purchase-requests/{$prId}/signed-copies")->assertOk()->json('data'));
        $this->assertEqualsCanonicalizing(['aoc_bac_passed', 'po_approved'], $listed->pluck('step')->all());
        $this->assertStringStartsWith('PO ', $listed->firstWhere('step', 'po_approved')['document']);
    }

    public function test_certifying_a_ppmp_and_approving_a_lib_need_the_signed_copy(): void
    {
        $this->requireScans();
        $uid = 'ppmp-'.uniqid();
        $this->withToken($this->token)->postJson('/api/v1/planning-ppmps', [
            'id' => $uid, 'ppmpClass' => 'Regular', 'status' => 'Submitted to Budget Officer', 'fiscalYear' => 2026, 'documentType' => 'Final',
            'rows' => [['id' => 'line-1', 'item_name' => 'Mini PC', 'general_description' => 'Mini PC', 'expense_category' => 'ICT Equipment', 'quantity' => 1, 'estimated_budget' => 30000]],
            'totalBudget' => 30000,
        ])->assertCreated();

        $this->postWithScan($this->token, "/api/v1/planning-ppmps/{$uid}/approve")->assertStatus(422);
        $this->postWithScan($this->token, "/api/v1/planning-ppmps/{$uid}/approve", [], $this->scan())
            ->assertOk()->assertJsonPath('data.status', 'Approved')->assertJsonPath('data.signedCopies.0.step', 'ppmp_approved');

        $rd = User::where('email', 'admin@dost.gov.ph')->first();
        $lib = new LibDocument;
        $lib->forceFill([
            'client_uid' => 'lib-'.uniqid(), 'fiscal_year' => '2026', 'project_title' => 'Scan Test LIB',
            'status' => 'Pending Regional Director Approval', 'owner_id' => $rd->id, 'owner_name' => $rd->name, 'approved_by_id' => $rd->id,
        ])->save();

        $this->postWithScan($this->token, "/api/v1/planning-libs/{$lib->client_uid}/approve")->assertStatus(422);
        $this->postWithScan($this->token, "/api/v1/planning-libs/{$lib->client_uid}/approve", [], $this->scan())
            ->assertOk()->assertJsonPath('data.status', 'Approved')->assertJsonPath('data.signedCopies.0.step', 'lib_approved');
    }
}
