<?php

namespace Tests\Feature;

use App\Mail\SystemMessage;
use App\Models\LibDocument;
use App\Models\PpmpDocument;
use App\Models\PpmpItem;
use App\Models\ProcurementItem;
use App\Models\Project;
use App\Models\PurchaseRequest;
use App\Models\SystemPreference;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** Flowchart Module 1 (blue lane): login email, "Regular fund?" branching, and Re-PR. */
class ModuleOneRoutingTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    private function loginAsAdmin(): string
    {
        return $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->json('token');
    }

    private function payload(string $fund, array $items, array $extra = []): array
    {
        return $extra + [
            'office_code' => 'RO',
            'fund_source' => $fund,
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Module 1 routing test.',
            'items' => $items,
        ];
    }

    /** Creates a PR then submits it; returns [response, prId]. */
    private function submit(string $token, array $payload): array
    {
        $prId = $this->withToken($token)->postJson('/api/v1/purchase-requests', $payload)->assertCreated()->json('data.id');

        return [$this->withToken($token)->postJson("/api/v1/purchase-requests/{$prId}/submit"), $prId];
    }

    private function checks(int $prId): \Illuminate\Support\Collection
    {
        return PurchaseRequest::find($prId)->validationResults()->get();
    }

    /** An approved planning PPMP with one line; Project class ones are backed by an approved LIB. */
    private function approvedPpmp(string $class, string $itemName, float $budget, string $expense = 'ICT Supplies'): PpmpDocument
    {
        $lib = $class === 'Project'
            ? LibDocument::create(['client_uid' => 'lib-'.uniqid(), 'fiscal_year' => '2026', 'project_title' => 'NOVA AI Hub', 'status' => 'Approved'])
            : null;
        $document = PpmpDocument::create([
            'client_uid' => 'ppmp-'.uniqid(),
            'project_id' => Project::first()->id,
            'lib_document_id' => $lib?->id,
            'ppmp_no' => 'PPMP-2026-9'.random_int(100, 999),
            'fiscal_year' => 2026,
            'status' => 'Approved',
            'ppmp_class' => $class,
        ]);
        $item = ProcurementItem::firstOrCreate(['name' => $itemName], ['uom' => 'unit', 'category' => $expense]);
        PpmpItem::create([
            'ppmp_document_id' => $document->id,
            'project_id' => $document->project_id,
            'procurement_item_id' => $item->id,
            'item_name' => $itemName,
            'expense_category' => $expense,
            'quantity' => 10,
            'estimated_unit_cost' => $budget / 10,
            'estimated_budget' => $budget,
        ]);

        return $document;
    }

    // --- Login email ---

    public function test_signing_in_emails_the_account_owner(): void
    {
        Mail::fake();

        $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->assertOk();

        Mail::assertQueued(SystemMessage::class, fn (SystemMessage $mail) => $mail->hasTo('admin@dost.gov.ph')
            && str_contains($mail->heading, 'New sign-in'));
    }

    public function test_a_failed_sign_in_sends_nothing_and_the_preference_turns_email_off(): void
    {
        Mail::fake();
        $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'wrong'])->assertStatus(422);
        Mail::assertNothingQueued();

        SystemPreference::updateOrCreate(['key' => 'email_notifications_enabled'], ['value' => ['value' => false], 'category' => 'Notifications', 'label' => 'Email', 'type' => 'boolean']);
        $this->postJson('/api/v1/auth/login', ['email' => 'admin@dost.gov.ph', 'password' => 'password123'])->assertOk();
        Mail::assertNothingQueued();
    }

    public function test_routing_notifications_email_a_link_into_the_web_app(): void
    {
        config(['app.frontend_url' => 'https://pr.dostcaraga.ph']);
        $token = $this->loginAsAdmin();
        Mail::fake();

        $this->submit($token, $this->payload('GAA 2026 - MOOE', [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]]))[0]->assertOk();

        Mail::assertQueued(SystemMessage::class, fn (SystemMessage $mail) => $mail->hasTo('admin@dost.gov.ph')
            && str_starts_with((string) $mail->actionUrl, 'https://pr.dostcaraga.ph/'));
    }

    // --- Regular fund: APP-CSE -> APP-Non-CSE ---

    public function test_regular_fund_checks_only_the_app_and_passes_an_app_cse_item(): void
    {
        $token = $this->loginAsAdmin();
        [$response, $prId] = $this->submit($token, $this->payload('GAA 2026 - MOOE', [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]]));

        $response->assertOk()->assertJsonPath('data.status', 'For Recommendation')->assertJsonPath('data.regular_fund', true);
        $labels = $this->checks($prId)->pluck('status', 'label');
        $this->assertSame('Passed', $labels['APP-CSE']);
        $this->assertSame('N/A', $labels['APP-Non-CSE']);
        $this->assertArrayNotHasKey('PPMP', $labels->all());
        $this->assertArrayNotHasKey('Line-Item Budget', $labels->all());
    }

    public function test_regular_fund_falls_back_to_app_non_cse(): void
    {
        $token = $this->loginAsAdmin();
        [$response, $prId] = $this->submit($token, $this->payload('GAA 2026 - MOOE', [['name' => 'Laptop, Business Class', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 52000]]));

        $response->assertOk();
        $labels = $this->checks($prId)->pluck('status', 'label');
        $this->assertSame('N/A', $labels['APP-CSE']);
        $this->assertSame('Passed', $labels['APP-Non-CSE']);
    }

    public function test_regular_fund_item_in_neither_app_is_rejected_with_the_flowchart_error(): void
    {
        $token = $this->loginAsAdmin();
        [$response, $prId] = $this->submit($token, $this->payload('GAA 2026 - MOOE', [['name' => 'Unlisted Coffee Machine', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 9000]]));

        $response->assertStatus(422);
        $this->assertSame('Returned', PurchaseRequest::find($prId)->status);
        $this->assertTrue($this->checks($prId)->contains(fn ($r) => $r->label === 'APP-Non-CSE' && $r->status === 'Failed'
            && str_contains($r->message, 'Items is not in APP-Non-CSE & APP-CSE')));
    }

    public function test_regular_fund_types_come_from_settings(): void
    {
        SystemPreference::updateOrCreate(['key' => 'regular_fund_types'], ['value' => ['value' => 'GAA, Trust'], 'category' => 'Procurement', 'label' => 'Regular Fund Types', 'type' => 'text']);
        $token = $this->loginAsAdmin();

        [$response] = $this->submit($token, $this->payload('Trust Fund - SETUP', [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]]));

        $response->assertOk()->assertJsonPath('data.regular_fund', true);
    }

    // --- Non-regular fund: Project -> PPMP -> LIB -> APP-Non-CSE ---

    public function test_non_regular_fund_needs_an_identified_project(): void
    {
        $token = $this->loginAsAdmin();
        [$response, $prId] = $this->submit($token, $this->payload('Trust Fund - SETUP', [['name' => 'WiFi Router', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 3000]]));

        $response->assertStatus(422);
        $this->assertTrue($this->checks($prId)->contains(fn ($r) => $r->label === 'Project' && $r->status === 'Failed'));
    }

    public function test_non_regular_fund_passes_project_ppmp_budget_and_app_non_cse(): void
    {
        $token = $this->loginAsAdmin();
        [$response, $prId] = $this->submit($token, $this->payload('Trust Fund - SETUP',
            [['name' => 'WiFi Router', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 3000]], ['project_code' => 'PROJ-2026-001']));

        $response->assertOk()->assertJsonPath('data.regular_fund', false)->assertJsonPath('data.identified_project', 'Office Productivity Upgrade');
        $labels = $this->checks($prId)->pluck('status', 'label');
        foreach (['Project', 'PPMP', 'Line-Item Budget', 'APP-Non-CSE'] as $label) {
            $this->assertSame('Passed', $labels[$label], $label);
        }
        $this->assertArrayNotHasKey('APP-CSE', $labels->all());
    }

    public function test_non_regular_item_not_in_the_ppmp_stops_with_the_flowchart_error(): void
    {
        $token = $this->loginAsAdmin();
        [$response, $prId] = $this->submit($token, $this->payload('Trust Fund - SETUP',
            [['name' => 'Laptop, Business Class', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 52000]], ['project_code' => 'PROJ-2026-001']));

        $response->assertStatus(422);
        $labels = $this->checks($prId)->keyBy('label');
        $this->assertSame('Failed', $labels['PPMP']->status);
        $this->assertStringContainsString('Item not in PPMP', $labels['PPMP']->message);
        $this->assertSame('N/A', $labels['Line-Item Budget']->status);
    }

    public function test_non_regular_path_checks_app_non_cse_only_as_the_flowchart_draws_it(): void
    {
        // A4 bond paper is in this project's PPMP and in APP-CSE, but the non-regular path only asks APP-Non-CSE.
        $token = $this->loginAsAdmin();
        [$response, $prId] = $this->submit($token, $this->payload('Trust Fund - SETUP',
            [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]], ['project_code' => 'PROJ-2026-001']));

        $response->assertStatus(422);
        $this->assertSame('Failed', $this->checks($prId)->firstWhere('label', 'APP-Non-CSE')->status);
    }

    public function test_charged_project_ppmp_identifies_the_project_and_caps_each_item_at_its_ppmp_budget(): void
    {
        $token = $this->loginAsAdmin();
        $ppmp = $this->approvedPpmp('Project', 'Mini PC for Kiosk', 30000);

        // 2 x 12,000 = 24,000 of 30,000: passes.
        [$first, $firstId] = $this->submit($token, $this->payload('Trust Fund - SETUP',
            [['name' => 'Mini PC for Kiosk', 'uom' => 'unit', 'quantity' => 2, 'unit_cost' => 12000]], ['ppmp_client_uid' => $ppmp->client_uid]));
        $first->assertOk()->assertJsonPath('data.identified_project', 'NOVA AI Hub')->assertJsonPath('data.ppmp_class', 'Project');

        // Another 12,000 would make 36,000 against the same PPMP line: over budget.
        [$second, $secondId] = $this->submit($token, $this->payload('Trust Fund - SETUP',
            [['name' => 'Mini PC for Kiosk', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 12000]], ['ppmp_client_uid' => $ppmp->client_uid]));
        $second->assertStatus(422);
        $this->assertStringContainsString('Item not within budget (LIB)', $this->checks($secondId)->firstWhere('label', 'Line-Item Budget')->message);

        // Cancelling the first PR releases its share, so the second now fits.
        PurchaseRequest::find($firstId)->forceFill(['status' => 'Cancelled'])->save();
        $this->withToken($token)->postJson("/api/v1/purchase-requests/{$secondId}/submit")->assertOk();
    }

    public function test_two_rows_that_fit_alone_but_not_together_fail_the_budget_check(): void
    {
        $token = $this->loginAsAdmin();
        $ppmp = $this->approvedPpmp('Project', 'Mini PC for Kiosk', 20000);

        [$response] = $this->submit($token, $this->payload('Trust Fund - SETUP', [
            ['name' => 'Mini PC for Kiosk', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 15000],
            ['name' => 'Mini PC for Kiosk', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 15000],
        ], ['ppmp_client_uid' => $ppmp->client_uid]));

        $response->assertStatus(422);
    }

    public function test_a_pr_charged_to_a_regular_ppmp_takes_the_regular_path(): void
    {
        $token = $this->loginAsAdmin();
        $ppmp = $this->approvedPpmp('Regular', 'Mini PC for Kiosk', 20000);

        [$response, $prId] = $this->submit($token, $this->payload('Trust Fund - SETUP',
            [['name' => 'Mini PC for Kiosk', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 15000]], ['ppmp_client_uid' => $ppmp->client_uid]));

        // Its approved PPMP line is non-CSE, so it counts as in APP-Non-CSE even before the APP is re-consolidated.
        $response->assertOk()->assertJsonPath('data.regular_fund', true);
        $this->assertSame('Passed', $this->checks($prId)->firstWhere('label', 'APP-Non-CSE')->status);
    }

    public function test_only_an_approved_ppmp_can_be_charged(): void
    {
        $token = $this->loginAsAdmin();
        $ppmp = $this->approvedPpmp('Project', 'Mini PC for Kiosk', 20000);
        $ppmp->forceFill(['status' => 'Draft'])->save();

        $this->withToken($token)->postJson('/api/v1/purchase-requests', $this->payload('Trust Fund - SETUP',
            [['name' => 'Mini PC for Kiosk', 'uom' => 'unit', 'quantity' => 1, 'unit_cost' => 100]], ['ppmp_client_uid' => $ppmp->client_uid]))
            ->assertStatus(422);
    }

    // --- Re-PR ---

    public function test_a_cancelled_pr_can_be_re_filed_once_as_a_new_draft(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->withToken($token)->postJson('/api/v1/purchase-requests', $this->payload('GAA 2026 - MOOE',
            [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 3, 'unit_cost' => 250]]))->json('data.id');

        $this->withToken($token)->postJson("/api/v1/purchase-requests/{$prId}/re-pr")->assertStatus(422); // not cancelled

        PurchaseRequest::find($prId)->forceFill(['status' => 'Cancelled', 'cancel_reason' => 'Supplier waived.'])->save();

        $copy = $this->withToken($token)->postJson("/api/v1/purchase-requests/{$prId}/re-pr")
            ->assertCreated()
            ->assertJsonPath('data.status', 'Draft')
            ->assertJsonPath('data.re_pr_of.id', $prId)
            ->assertJsonPath('data.items.0.name', 'A4-sized Bond Paper')
            ->json('data');
        $this->assertNotSame(PurchaseRequest::find($prId)->pr_no, $copy['pr_no']);

        $this->withToken($token)->getJson("/api/v1/purchase-requests/{$prId}")->assertJsonPath('data.re_pr.id', $copy['id']);
        $this->withToken($token)->postJson("/api/v1/purchase-requests/{$prId}/re-pr")->assertStatus(422); // only once
    }

    public function test_only_the_owner_can_re_pr(): void
    {
        $owner = $this->loginAsAdmin();
        $prId = $this->withToken($owner)->postJson('/api/v1/purchase-requests', $this->payload('GAA 2026 - MOOE',
            [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]]))->json('data.id');
        PurchaseRequest::find($prId)->forceFill(['status' => 'Cancelled', 'requested_by' => User::where('email', 'admin@dost.gov.ph')->value('id')])->save();

        $other = $this->postJson('/api/v1/auth/login', ['email' => 'mdelacruz@dost.gov.ph', 'password' => 'password123'])->json('token');
        $this->withToken($other)->postJson("/api/v1/purchase-requests/{$prId}/re-pr")->assertStatus(404);
    }
}
