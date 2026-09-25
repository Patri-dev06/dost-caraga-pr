<?php

namespace Tests\Feature;

use App\Models\PpmpDocument;
use App\Models\PurchaseRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** Locking a submitted/approved PPMP, and the protocol for revising an approved one. */
class PpmpRevisionTest extends TestCase
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

    private function row(string $id, string $name, float $budget, float $quantity = 10): array
    {
        return ['id' => $id, 'item_name' => $name, 'general_description' => $name, 'expense_category' => 'ICT Equipment', 'quantity' => $quantity, 'estimated_budget' => $budget];
    }

    private function save(string $uid, string $status, array $rows, bool $create = false): \Illuminate\Testing\TestResponse
    {
        $payload = [
            'id' => $uid, 'ppmpClass' => 'Regular', 'status' => $status, 'fiscalYear' => 2026, 'documentType' => 'Final',
            'rows' => $rows, 'totalBudget' => array_sum(array_column($rows, 'estimated_budget')),
        ];

        return $create
            ? $this->withToken($this->token)->postJson('/api/v1/planning-ppmps', $payload)
            : $this->withToken($this->token)->putJson("/api/v1/planning-ppmps/{$uid}", $payload);
    }

    private function approve(string $uid): \Illuminate\Testing\TestResponse
    {
        return $this->withToken($this->token)->postJson("/api/v1/planning-ppmps/{$uid}/approve");
    }

    /** An approved Regular PPMP with one Mini PC line of ₱30,000; returns its client uid. */
    private function approvedPpmp(): string
    {
        $uid = 'ppmp-'.uniqid();
        $this->save($uid, 'Submitted to Budget Officer', [$this->row('line-1', 'Mini PC for Kiosk', 30000)], create: true)->assertCreated();
        $this->approve($uid)->assertOk()->assertJsonPath('data.status', 'Approved');

        return $uid;
    }

    private function revise(string $uid, string $reason = 'Two more kiosks were added to the project after the budget call.'): \Illuminate\Testing\TestResponse
    {
        return $this->withToken($this->token)->postJson("/api/v1/planning-ppmps/{$uid}/revise", ['reason' => $reason]);
    }

    /** A draft PR charged to the PPMP drawing $amount from its Mini PC line; returns the PR id. */
    private function prChargedTo(string $uid, float $amount): int
    {
        return $this->withToken($this->token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO', 'fund_source' => 'GAA 2026 - MOOE', 'mode_of_procurement' => 'Shopping',
            'purpose' => 'Kiosk units.', 'ppmp_client_uid' => $uid,
            'items' => [['name' => 'Mini PC for Kiosk', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => $amount]],
        ])->assertCreated()->json('data.id');
    }

    public function test_a_ppmp_with_the_budget_officer_or_approved_cannot_be_edited_or_deleted(): void
    {
        $uid = 'ppmp-'.uniqid();
        $rows = [$this->row('line-1', 'Mini PC for Kiosk', 30000)];
        $this->save($uid, 'Submitted to Budget Officer', $rows, create: true)->assertCreated();

        $this->save($uid, 'Draft', $rows)->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'with the Budget Officer'));
        $this->withToken($this->token)->deleteJson("/api/v1/planning-ppmps/{$uid}")->assertStatus(422);

        $this->approve($uid)->assertOk();
        $this->save($uid, 'Submitted to Budget Officer', $rows)->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'Revise PPMP'));
        $this->withToken($this->token)->deleteJson("/api/v1/planning-ppmps/{$uid}")->assertStatus(422);
        $this->approve($uid)->assertStatus(422); // nothing to review
    }

    public function test_the_approved_version_stays_in_force_until_the_revision_is_certified(): void
    {
        $uid = $this->approvedPpmp();
        $prId = $this->prChargedTo($uid, 12000);
        $original = PpmpDocument::where('client_uid', $uid)->first();

        $this->revise($uid, 'too short')->assertStatus(422);
        $revision = $this->revise($uid)->assertCreated()
            ->assertJsonPath('data.status', 'Draft')
            ->assertJsonPath('data.revisionCount', 1)
            ->assertJsonPath('data.revisionOfId', $uid)
            ->json('data');
        $this->revise($uid)->assertStatus(422); // one open revision at a time

        // While the revision is worked on, the approved version is untouched and still charged.
        $this->withToken($this->token)->getJson("/api/v1/planning-ppmps/{$uid}")->assertOk()
            ->assertJsonPath('data.status', 'Approved')
            ->assertJsonPath('data.openRevision.id', $revision['id']);
        $this->assertSame($original->id, PurchaseRequest::find($prId)->ppmp_document_id);

        // Raise the Mini PC line and add a new one, then send it for re-certification.
        $this->save($revision['id'], 'Submitted to Budget Officer', [
            $this->row('line-1', 'Mini PC for Kiosk', 45000, 15),
            $this->row('line-2', 'Kiosk Stand', 8000, 4),
        ])->assertOk();

        $changes = $this->withToken($this->token)->getJson("/api/v1/planning-ppmps/{$revision['id']}")->json('data.changes');
        $this->assertEquals(30000, $changes['totalBefore']);
        $this->assertEquals(53000, $changes['totalAfter']);
        $this->assertSame('line-2', $changes['added'][0]['id']);
        $this->assertEquals(45000, $changes['changed'][0]['budgetAfter']);

        $this->approve($revision['id'])->assertOk()->assertJsonPath('data.status', 'Approved');

        // The revision replaces the old version, and the PR now draws on the revision.
        $this->withToken($this->token)->getJson("/api/v1/planning-ppmps/{$uid}")->assertOk()
            ->assertJsonPath('data.status', 'Superseded')
            ->assertJsonPath('data.supersededById', $revision['id'])
            ->assertJsonPath('data.openRevision', null);
        $this->assertSame(PpmpDocument::where('client_uid', $revision['id'])->value('id'), PurchaseRequest::find($prId)->ppmp_document_id);
        $this->save($uid, 'Draft', [$this->row('line-1', 'Mini PC for Kiosk', 1)])->assertStatus(422);

        // The certified revision can itself be revised later: Revision 2.
        $this->revise($revision['id'])->assertCreated()->assertJsonPath('data.revisionCount', 2);
    }

    public function test_a_revision_cannot_cut_budget_that_prs_already_use(): void
    {
        $uid = $this->approvedPpmp();
        $this->prChargedTo($uid, 24000);
        $revisionId = $this->revise($uid)->json('data.id');

        $this->save($revisionId, 'Submitted to Budget Officer', [$this->row('line-1', 'Mini PC for Kiosk', 20000)])
            ->assertStatus(422)
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Mini PC for Kiosk') && str_contains($m, 'already use'));
        $this->assertSame('Draft', PpmpDocument::where('client_uid', $revisionId)->value('status'));

        // Down to exactly what the PR uses is fine.
        $this->save($revisionId, 'Submitted to Budget Officer', [$this->row('line-1', 'Mini PC for Kiosk', 24000)])->assertOk();
    }

    public function test_a_draft_revision_can_be_discarded_and_started_again(): void
    {
        $uid = $this->approvedPpmp();
        $revisionId = $this->revise($uid)->json('data.id');

        $this->withToken($this->token)->deleteJson("/api/v1/planning-ppmps/{$revisionId}")->assertOk();
        $this->assertSame('Approved', PpmpDocument::where('client_uid', $uid)->value('status'));
        $this->revise($uid)->assertCreated()->assertJsonPath('data.revisionCount', 1);
    }

    public function test_returning_a_ppmp_does_not_count_as_a_revision(): void
    {
        $uid = 'ppmp-'.uniqid();
        $this->save($uid, 'Submitted to Budget Officer', [$this->row('line-1', 'Mini PC for Kiosk', 30000)], create: true)->assertCreated();

        $this->withToken($this->token)->postJson("/api/v1/planning-ppmps/{$uid}/return", ['returnReason' => 'Split the line by quarter.'])
            ->assertOk()->assertJsonPath('data.status', 'Returned')->assertJsonPath('data.revisionCount', 0);
        $this->save($uid, 'Submitted to Budget Officer', [$this->row('line-1', 'Mini PC for Kiosk', 30000)])->assertOk();
    }
}
