<?php

namespace Tests\Feature;

use App\Models\Office;
use App\Models\Role;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProcurementApiTest extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    public function test_admin_can_login_and_list_purchase_requests(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        $login->assertOk()->assertJsonStructure(['token', 'expires_in', 'user']);

        $this->withToken($login->json('token'))
            ->getJson('/api/v1/purchase-requests')
            ->assertOk()
            ->assertJsonStructure(['data']);
    }

    public function test_seed_purchase_request_can_be_validated(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($login->json('token'))
            ->postJson('/api/v1/purchase-requests/1/validate')
            ->assertOk()
            ->assertJsonStructure(['status', 'errors', 'warnings', 'data']);
    }

    public function test_ppmp_check_returns_match_for_project_item(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($login->json('token'))
            ->postJson('/api/v1/checks/ppmp', [
                'project_id' => 1,
                'name' => 'A4-sized Bond Paper',
            ])
            ->assertOk()
            ->assertJsonPath('data.label', 'PPMP')
            ->assertJsonPath('data.status', 'Passed')
            ->assertJsonStructure(['data' => ['label', 'status', 'message', 'matched']]);
    }

    public function test_lib_check_fails_when_requested_amount_exceeds_available_budget(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($login->json('token'))
            ->postJson('/api/v1/checks/lib', [
                'project_id' => 1,
                'account_code' => '5021201000',
                'amount' => 2000000,
            ])
            ->assertOk()
            ->assertJsonPath('data.label', 'Line-Item Budget')
            ->assertJsonPath('data.status', 'Failed')
            ->assertJsonPath('data.available', 1660000);
    }

    public function test_purchase_request_can_be_created_from_form_payload(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($login->json('token'))
            ->postJson('/api/v1/purchase-requests', [
                'office' => 'RO',
                'fundSource' => 'GAA',
                'projectTitle' => 'Office Productivity Upgrade',
                'requestedBy' => User::where('email', 'mdelacruz@dost.gov.ph')->value('id'),
                'modeOfProcurement' => 'Shopping',
                'purpose' => 'Create a PR from the frontend form.',
                'items' => [
                    [
                        'name' => 'Laptop, Business Class',
                        'description' => 'i7, 16GB RAM, 512GB SSD',
                        'uom' => 'unit',
                        'qty' => 1,
                        'unitCost' => 52000,
                    ],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'Draft')
            ->assertJsonPath('data.office', 'Regional Office')
            ->assertJsonPath('data.fund_type', 'GAA')
            ->assertJsonPath('data.requested_by.name', 'Maria Dela Cruz')
            ->assertJsonPath('data.items.0.procurement_item_id', 1)
            ->assertJsonPath('data.items.0.quantity', '1.00')
            ->assertJsonPath('data.items.0.unit_cost', '52000.00');
    }

    public function test_purchase_request_can_be_created_and_submitted_when_validation_passes(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($login->json('token'))
            ->postJson('/api/v1/purchase-requests', [
                'office_code' => 'RO',
                'fund_source' => 'GAA 2026 - MOOE',
                'project_code' => 'PROJ-2026-001',
                'mode_of_procurement' => 'Shopping',
                'purpose' => 'Create and submit a validated PR.',
                'submit' => true,
                'items' => [
                    [
                        'name' => 'A4-sized Bond Paper',
                        'description' => 'A4 sized bond paper.',
                        'uom' => 'ream',
                        'quantity' => 1,
                        'unit_cost' => 250,
                    ],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'For Recommendation')
            ->assertJsonPath('data.stage', 'Supervisor/Recommending Approval for Digital Sign');
    }

    public function test_singular_purchase_request_endpoint_can_create_draft(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($login->json('token'))
            ->postJson('/api/v1/purchase-request', [
                'office' => 'RO',
                'fundSource' => 'GAA',
                'projectTitle' => 'Office Productivity Upgrade',
                'modeOfProcurement' => 'Shopping',
                'purpose' => 'Create a PR through the singular compatibility endpoint.',
                'items' => [
                    [
                        'name' => 'Wireless Mouse',
                        'description' => 'Ergonomic, optical',
                        'uom' => 'pc',
                        'qty' => 2,
                        'unitCost' => 850,
                    ],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'Draft')
            ->assertJsonPath('data.items.0.name', 'Wireless Mouse');
    }

    public function test_reference_entries_can_be_created_from_item_names(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($login->json('token'))
            ->postJson('/api/v1/ppmp/1', [
                'code' => 'PPMP-NEW-001',
                'item_name' => 'Document Scanner',
                'category' => 'ICT Equipment',
                'uom' => 'unit',
                'quantity' => 2,
                'estimated_unit_cost' => 25000,
                'schedule' => 'Q3 2026',
            ])
            ->assertCreated()
            ->assertJsonPath('code', 'PPMP-NEW-001')
            ->assertJsonPath('item.name', 'Document Scanner');

        $this->withToken($login->json('token'))
            ->postJson('/api/v1/app-cse', [
                'code' => 'CSE-NEW-001',
                'item_name' => 'Permanent Marker',
                'category' => 'Common-Use Supplies',
                'uom' => 'pc',
                'quantity' => 50,
                'unit_price' => 35,
            ])
            ->assertCreated()
            ->assertJsonPath('code', 'CSE-NEW-001')
            ->assertJsonPath('item.name', 'Permanent Marker')
            ->assertJsonPath('item.is_cse', true);

        $this->withToken($login->json('token'))
            ->postJson('/api/v1/app-non-cse', [
                'code' => 'NC-NEW-001',
                'item_name' => 'Lab Glassware Set',
                'category' => 'Lab Equipment',
                'uom' => 'set',
                'quantity' => 3,
                'estimated_cost' => 45000,
            ])
            ->assertCreated()
            ->assertJsonPath('code', 'NC-NEW-001')
            ->assertJsonPath('item.name', 'Lab Glassware Set');
    }

    public function test_ppmp_document_can_be_imported_with_multiple_rows(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($login->json('token'))
            ->postJson('/api/v1/ppmp/1/documents', [
                'document' => [
                    'ppmp_no' => 'PPMP-2026-MIS',
                    'fiscal_year' => 2026,
                    'end_user_unit' => 'MIS',
                    'document_type' => 'Final',
                    'source_filename' => 'mis-ppmp.xlsx',
                    'prepared_submitted_by_name' => 'Juan Dela Cruz',
                    'prepared_submitted_by_position' => 'MIS Staff',
                    'prepared_submitted_by_date' => '2026-05-10',
                    'budget_officer_name' => 'Ana Santos',
                    'budget_officer_position' => 'Budget Officer',
                    'budget_certified_date' => '2026-05-11',
                ],
                'rows' => [
                    [
                        'row_number' => 1,
                        'expense_category' => 'Office Supplies',
                        'general_description' => 'Supply and delivery of office supplies.',
                        'project_type' => 'Goods',
                        'item_name' => 'Blue Liquid Gel Ink 0.5mm Sign Pen',
                        'uom' => 'pieces',
                        'quantity' => 20,
                        'quantity_size' => "Blue Liquid Gel Ink 0.5mm Sign Pen\nQuantity: 20 pieces",
                        'recommended_mode' => 'Small Value Procurement',
                        'pre_procurement_conference' => 'No',
                        'procurement_start' => 'Jan-26',
                        'procurement_end' => 'Jan-26',
                        'delivery_period' => '02/2026',
                        'source_of_funds' => 'LGIA 2026 Current Appropriation-NOVA Hub',
                        'estimated_budget' => 500,
                    ],
                    [
                        'row_number' => 2,
                        'expense_category' => 'Office Supplies',
                        'general_description' => 'Supply and delivery of office supplies.',
                        'project_type' => 'Goods',
                        'item_name' => 'A4 Sized Bond Paper',
                        'uom' => 'reams',
                        'quantity' => 5,
                        'quantity_size' => "A4 Sized Bond Paper\nQuantity: 5 reams",
                        'recommended_mode' => 'Small Value Procurement',
                        'pre_procurement_conference' => 'No',
                        'procurement_start' => 'Jan-26',
                        'procurement_end' => 'Jan-26',
                        'delivery_period' => '02/2026',
                        'source_of_funds' => 'LGIA 2026 Current Appropriation-NOVA Hub',
                        'estimated_budget' => 1400,
                    ],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.ppmp_no', 'PPMP-2026-MIS')
            ->assertJsonPath('data.row_count', 2)
            ->assertJsonPath('data.total_estimated_budget', '1900.00')
            ->assertJsonPath('data.prepared_submitted_by_name', 'Juan Dela Cruz')
            ->assertJsonPath('data.budget_officer_name', 'Ana Santos')
            ->assertJsonPath('data.items.0.item.name', 'Blue Liquid Gel Ink 0.5mm Sign Pen')
            ->assertJsonPath('data.items.1.estimated_budget', '1400.00');

        $this->assertDatabaseHas('ppmp_documents', [
            'ppmp_no' => 'PPMP-2026-MIS',
            'row_count' => 2,
        ]);

        $this->assertDatabaseHas('ppmp_items', [
            'expense_category' => 'Office Supplies',
            'estimated_budget' => 500,
        ]);
    }

    public function test_reference_endpoints_can_be_listed(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($login->json('token'))
            ->getJson('/api/v1/ppmp/1')
            ->assertOk()
            ->assertJsonStructure(['data']);

        $this->withToken($login->json('token'))
            ->getJson('/api/v1/app-cse/1')
            ->assertOk()
            ->assertJsonStructure(['data']);

        $this->withToken($login->json('token'))
            ->getJson('/api/v1/app-non-cse/1')
            ->assertOk()
            ->assertJsonStructure(['data']);

        $this->withToken($login->json('token'))
            ->getJson('/api/v1/budget/1')
            ->assertOk()
            ->assertJsonStructure(['total', 'used', 'available', 'data']);
    }

    public function test_budget_allocation_can_be_created(): void
    {
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ]);

        $this->withToken($login->json('token'))
            ->postJson('/api/v1/budget/1', [
                'account_code' => '5020301000',
                'account_name' => 'Office Supplies',
                'allocated_amount' => 250000,
                'obligated_amount' => 50000,
            ])
            ->assertCreated()
            ->assertJsonPath('account_code', '5020301000')
            ->assertJsonPath('allocated_amount', '250000.00')
            ->assertJsonPath('obligated_amount', '50000.00');
    }

    private function loginAsAdmin(): string
    {
        return $this->postJson('/api/v1/auth/login', [
            'email' => 'admin@dost.gov.ph',
            'password' => 'password123',
        ])->json('token');
    }

    /** A user with the "approvals" module but not the given role — for negative access-control tests. */
    private function loginAsUserWithoutRole(string $excludedRole): string
    {
        $user = User::create([
            'name' => 'Unprivileged Approvals User',
            'email' => 'unprivileged-'.$excludedRole.'@dost.gov.ph',
            'password' => Hash::make('password123'),
            'office_id' => Office::first()->id,
            'status' => 'Active',
            'tier' => 'regular',
            'modules' => ['approvals'],
        ]);
        $user->roles()->sync(Role::where('name', '!=', $excludedRole)->pluck('id'));

        return $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->json('token');
    }

    private function createSubmittedPr(string $token): int
    {
        $create = $this->withToken($token)->postJson('/api/v1/purchase-requests', [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'project_code' => 'PROJ-2026-001',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'PR for approval access-control tests.',
            'submit' => true,
            'items' => [
                ['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250],
            ],
        ])->assertCreated();

        return $create->json('data.id');
    }

    public function test_recommend_is_blocked_without_the_recommender_role(): void
    {
        $adminToken = $this->loginAsAdmin();
        $prId = $this->createSubmittedPr($adminToken);

        $outsiderToken = $this->loginAsUserWithoutRole('Recommender');

        $this->withToken($outsiderToken)
            ->postJson("/api/v1/approvals/{$prId}/recommend")
            ->assertStatus(403);

        // The designated Recommender (seeded admin) can still recommend it.
        $this->withToken($adminToken)
            ->postJson("/api/v1/approvals/{$prId}/recommend")
            ->assertOk()
            ->assertJsonPath('data.status', 'For Approval');
    }

    public function test_approve_is_blocked_unless_the_designated_regional_director(): void
    {
        $adminToken = $this->loginAsAdmin();
        $prId = $this->createSubmittedPr($adminToken);
        $this->withToken($adminToken)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();

        // Even a user who does hold the Recommender role, but isn't the
        // Settings-designated Regional Director, must not be able to approve.
        $outsiderToken = $this->loginAsUserWithoutRole('__none__');

        $this->withToken($outsiderToken)
            ->postJson("/api/v1/approvals/{$prId}/approve")
            ->assertStatus(403);

        $this->withToken($adminToken)
            ->postJson("/api/v1/approvals/{$prId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'Approved');
    }

    public function test_submitting_a_pr_notifies_the_recommenders(): void
    {
        $adminToken = $this->loginAsAdmin();
        $prId = $this->createSubmittedPr($adminToken);

        $this->assertDatabaseHas('user_notifications', [
            'user_id' => User::where('email', 'admin@dost.gov.ph')->value('id'),
            'type' => 'pr_submitted',
        ]);
        $this->assertSame($prId, UserNotification::where('type', 'pr_submitted')->first()->data['prId']);
    }

    public function test_recommend_and_approve_notify_the_next_actor_and_requester(): void
    {
        $adminToken = $this->loginAsAdmin();
        $prId = $this->createSubmittedPr($adminToken);
        $adminId = User::where('email', 'admin@dost.gov.ph')->value('id');

        $this->withToken($adminToken)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->assertDatabaseHas('user_notifications', ['user_id' => $adminId, 'type' => 'pr_recommended']);

        $this->withToken($adminToken)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();
        $this->assertDatabaseHas('user_notifications', ['user_id' => $adminId, 'type' => 'pr_approved']);
    }

    public function test_recommend_and_approve_require_an_e_signature(): void
    {
        $adminToken = $this->loginAsAdmin();
        $prId = $this->createSubmittedPr($adminToken);

        User::where('email', 'admin@dost.gov.ph')->update(['signature' => null]);

        $this->withToken($adminToken)->postJson("/api/v1/approvals/{$prId}/recommend")->assertStatus(422);
        $this->withToken($adminToken)->postJson("/api/v1/approvals/{$prId}/approve")->assertStatus(422);
        $this->assertSame('For Recommendation', \App\Models\PurchaseRequest::find($prId)->status);
    }

    public function test_regular_requester_can_submit_a_draft_without_the_validation_module(): void
    {
        $token = $this->postJson('/api/v1/auth/login', [
            'email' => 'mdelacruz@dost.gov.ph',
            'password' => 'password123',
        ])->json('token');

        $payload = [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'project_code' => 'PROJ-2026-001',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Regular user continuing a draft.',
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ];

        $prId = $this->withToken($token)->postJson('/api/v1/purchase-requests', $payload)
            ->assertCreated()->assertJsonPath('data.status', 'Draft')->json('data.id');

        // Editing the draft, then viewing its checks and submitting, all work with only the PR module.
        $this->withToken($token)->putJson("/api/v1/purchase-requests/{$prId}", ['purpose' => 'Edited draft.'] + $payload)->assertOk();
        $this->withToken($token)->postJson("/api/v1/purchase-requests/{$prId}/validate")->assertOk();
        $this->withToken($token)->postJson("/api/v1/purchase-requests/{$prId}/submit")
            ->assertOk()->assertJsonPath('data.status', 'For Recommendation');

        // Create-with-submit takes the same path.
        $this->withToken($token)->postJson('/api/v1/purchase-requests', $payload + ['submit' => true])
            ->assertCreated()->assertJsonPath('data.status', 'For Recommendation');
    }

    public function test_viewing_checks_never_changes_a_purchase_requests_status(): void
    {
        $token = $this->loginAsAdmin();

        // A draft must stay editable after its checks are viewed.
        $draftId = $this->withToken($token)->postJson('/api/v1/purchase-requests', $this->prPayload())->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/purchase-requests/{$draftId}/validate")->assertOk();
        $this->assertSame('Draft', \App\Models\PurchaseRequest::find($draftId)->status);

        // So must a PR that is already moving through, or past, approval.
        $prId = $this->createSubmittedPr($token);
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();
        $this->withToken($token)->postJson("/api/v1/purchase-requests/{$prId}/validate")->assertOk();
        $this->assertSame('For Approval', \App\Models\PurchaseRequest::find($prId)->status);

        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/approve")->assertOk();
        $this->withToken($token)->postJson("/api/v1/purchase-requests/{$prId}/validate")->assertOk();
        $this->assertSame('Approved', \App\Models\PurchaseRequest::find($prId)->status);
    }

    public function test_an_already_submitted_purchase_request_cannot_be_submitted_again(): void
    {
        $token = $this->loginAsAdmin();
        $prId = $this->createSubmittedPr($token);
        $this->withToken($token)->postJson("/api/v1/approvals/{$prId}/recommend")->assertOk();

        $this->withToken($token)->postJson("/api/v1/purchase-requests/{$prId}/submit")->assertStatus(422);
        $this->assertSame('For Approval', \App\Models\PurchaseRequest::find($prId)->status);
    }

    public function test_a_failed_submit_returns_the_purchase_request_for_editing(): void
    {
        $token = $this->loginAsAdmin();
        $payload = $this->prPayload();
        $payload['items'][0]['unit_cost'] = 99999999; // blows through the line-item budget

        $prId = $this->withToken($token)->postJson('/api/v1/purchase-requests', $payload)->assertCreated()->json('data.id');
        $this->withToken($token)->postJson("/api/v1/purchase-requests/{$prId}/submit")->assertStatus(422);

        $this->assertSame('Returned', \App\Models\PurchaseRequest::find($prId)->status);
    }

    private function prPayload(): array
    {
        return [
            'office_code' => 'RO',
            'fund_source' => 'GAA 2026 - MOOE',
            'project_code' => 'PROJ-2026-001',
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'PR status tests.',
            'items' => [['name' => 'A4-sized Bond Paper', 'uom' => 'ream', 'quantity' => 1, 'unit_cost' => 250]],
        ];
    }

    public function test_pr_requester_includes_their_position(): void
    {
        $token = $this->loginAsAdmin();
        $requester = User::where('email', 'mdelacruz@dost.gov.ph')->first();
        $requester->update(['position' => 'Science Research Specialist II']);

        $prId = $this->withToken($token)->postJson('/api/v1/purchase-requests', $this->prPayload() + ['requestedBy' => $requester->id])
            ->assertCreated()->json('data.id');

        $this->withToken($token)->getJson("/api/v1/purchase-requests/{$prId}")
            ->assertOk()
            ->assertJsonPath('data.requested_by.name', 'Maria Dela Cruz')
            ->assertJsonPath('data.requested_by.position', 'Science Research Specialist II');
    }
}
