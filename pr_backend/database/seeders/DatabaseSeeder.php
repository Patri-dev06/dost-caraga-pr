<?php

namespace Database\Seeders;

use App\Models\AppCseItem;
use App\Models\AppNonCseItem;
use App\Models\BudgetAllocation;
use App\Models\FundSource;
use App\Models\Office;
use App\Models\PpmpDocument;
use App\Models\PpmpItem;
use App\Models\ProcurementItem;
use App\Models\Project;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $offices = collect([
            ['name' => 'Regional Office', 'code' => 'RO'],
            ['name' => 'Planning & Management Division', 'code' => 'PMD'],
            ['name' => 'S&T Services Division', 'code' => 'STSD'],
            ['name' => 'Finance & Admin', 'code' => 'FAD'],
            ['name' => 'Office of the Director', 'code' => 'ORD'],
            ['name' => 'ICTU', 'code' => 'ICTU'],
        ])->map(fn ($data) => Office::updateOrCreate(['code' => $data['code']], $data));

        $roles = collect([
            ['name' => 'Requester', 'description' => 'Creates and submits Purchase Requests.', 'permissions' => ['Create PR', 'Submit PR', 'View own PRs']],
            ['name' => 'Validator', 'description' => 'Performs item pre-validation against PPMP/APP/Budget.', 'permissions' => ['Validate items', 'Return PR', 'View PRs']],
            ['name' => 'Recommender', 'description' => 'Reviews and recommends PRs for approval.', 'permissions' => ['Recommend', 'Return', 'View PRs']],
            ['name' => 'Approver', 'description' => 'Final approving authority for procurement requests.', 'permissions' => ['Approve', 'Reject', 'Return', 'View PRs']],
            ['name' => 'Admin', 'description' => 'Manages users, roles, and reference data.', 'permissions' => ['Manage users', 'Manage references', 'View audit logs']],
        ])->map(fn ($data) => Role::updateOrCreate(['name' => $data['name']], $data));

        $superadmin = User::updateOrCreate(['email' => 'superadmin@dost.gov.ph'], [
            'name' => 'System Superadmin',
            'password' => Hash::make('password123'),
            'office_id' => $offices->firstWhere('code', 'ORD')->id,
            'status' => 'Active',
            'tier' => 'superadmin',
            'modules' => null,
        ]);
        $superadmin->roles()->sync([$roles->firstWhere('name', 'Admin')->id]);

        $admin = User::updateOrCreate(['email' => 'admin@dost.gov.ph'], [
            'name' => 'Supply Unit Admin',
            'password' => Hash::make('password123'),
            'office_id' => $offices->firstWhere('code', 'ICTU')->id,
            'status' => 'Active',
            'tier' => 'admin',
            'modules' => null,
            // Every "digital sign" gate (RFQ/AOC/PO/LIB) requires the acting user
            // to have an e-signature on file. Seed a placeholder 1x1 PNG so the
            // demo account (also used as every default designated signatory) can
            // actually walk the full chain out of the box.
            'signature' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        ]);
        $admin->roles()->sync([$roles->firstWhere('name', 'Admin')->id, $roles->firstWhere('name', 'Recommender')->id]);

        $requester = User::updateOrCreate(['email' => 'mdelacruz@dost.gov.ph'], [
            'name' => 'Maria Dela Cruz',
            'password' => Hash::make('password123'),
            'office_id' => $offices->firstWhere('code', 'RO')->id,
            'status' => 'Active',
            'tier' => 'regular',
            'modules' => ['pr', 'lib', 'ppmp'],
        ]);
        $requester->roles()->sync([$roles->firstWhere('name', 'Requester')->id]);

        $gaa = FundSource::updateOrCreate(['name' => 'GAA 2026 - MOOE'], ['fund_type' => 'GAA', 'description' => 'Regular fund for MOOE']);
        FundSource::updateOrCreate(['name' => 'Trust Fund - SETUP'], ['fund_type' => 'Trust', 'description' => 'Non-regular SETUP trust fund']);

        $project = Project::updateOrCreate(['code' => 'PROJ-2026-001'], [
            'office_id' => $offices->firstWhere('code', 'RO')->id,
            'fund_source_id' => $gaa->id,
            'title' => 'Office Productivity Upgrade',
            'description' => 'Replacement of unserviceable office equipment.',
            'fiscal_year' => 2026,
            'status' => 'Active',
        ]);

        $items = collect([
            ['name' => 'Laptop, Business Class', 'description' => 'i7, 16GB RAM, 512GB SSD', 'category' => 'ICT Equipment', 'uom' => 'unit', 'is_cse' => false],
            ['name' => 'Wireless Mouse', 'description' => 'Ergonomic, optical', 'category' => 'ICT Equipment', 'uom' => 'pc', 'is_cse' => false],
            ['name' => 'Round-trip airfare for technical experts', 'description' => 'DOST Caraga personnel travel for lectures, hands-on training, and consultation.', 'category' => 'Traveling Expenses', 'uom' => 'pax', 'is_cse' => false],
            ['name' => 'Blue Liquid Gel Ink 0.5mm Sign Pen', 'description' => 'Blue liquid gel ink sign pen.', 'category' => 'Office Supplies', 'uom' => 'piece', 'is_cse' => true],
            ['name' => 'Backfold 19mm Binder Clip', 'description' => '19mm binder clip.', 'category' => 'Office Supplies', 'uom' => 'piece', 'is_cse' => true],
            ['name' => 'Backfold 32mm Binder Clip', 'description' => '32mm binder clip.', 'category' => 'Office Supplies', 'uom' => 'piece', 'is_cse' => true],
            ['name' => 'Backfold 50mm Binder Clip', 'description' => '50mm binder clip.', 'category' => 'Office Supplies', 'uom' => 'piece', 'is_cse' => true],
            ['name' => 'Standard Size Stapler', 'description' => 'Standard size stapler.', 'category' => 'Office Supplies', 'uom' => 'box', 'is_cse' => true],
            ['name' => 'Standard Size Staple Wire', 'description' => 'Standard size staple wire.', 'category' => 'Office Supplies', 'uom' => 'piece', 'is_cse' => true],
            ['name' => 'Chisel Tip Quick-Drying Highlighter', 'description' => 'Neon-yellow, green, and orange quick-drying highlighter.', 'category' => 'Office Supplies', 'uom' => 'piece', 'is_cse' => true],
            ['name' => 'Green Legal Size Pressboard Folder', 'description' => 'Green legal size pressboard folder.', 'category' => 'Office Supplies', 'uom' => 'pack', 'is_cse' => true],
            ['name' => 'A4-sized Sticker Paper', 'description' => 'A4 sticker paper.', 'category' => 'Office Supplies', 'uom' => 'box', 'is_cse' => true],
            ['name' => '20 Boxes Plastic Coated Paper Clip', 'description' => 'Plastic coated paper clip.', 'category' => 'Office Supplies', 'uom' => 'box', 'is_cse' => true],
            ['name' => '3x4 Sticky Note Pad', 'description' => '3x4 sticky note pad.', 'category' => 'Office Supplies', 'uom' => 'pack', 'is_cse' => true],
            ['name' => 'Index Tab', 'description' => 'Index tab.', 'category' => 'Office Supplies', 'uom' => 'ream', 'is_cse' => true],
            ['name' => 'A4-sized Bond Paper', 'description' => 'A4 sized bond paper.', 'category' => 'Office Supplies', 'uom' => 'ream', 'is_cse' => true],
            ['name' => 'Legal-sized Bond Paper', 'description' => 'Legal sized bond paper.', 'category' => 'Office Supplies', 'uom' => 'ream', 'is_cse' => true],
            ['name' => 'Split Type Inverter Air Conditioner 2.5HP', 'description' => '220V inverter air conditioner with refrigerant.', 'category' => 'Office Supplies', 'uom' => 'unit', 'is_cse' => false],
            ['name' => 'WiFi Router', 'description' => 'Wireless router for MIS office operations.', 'category' => 'ICT Supplies', 'uom' => 'unit', 'is_cse' => false],
            ['name' => 'Office Chair, Mid-back', 'description' => 'Mesh chair', 'category' => 'Furniture', 'uom' => 'unit', 'is_cse' => false],
        ])->map(fn ($data) => ProcurementItem::updateOrCreate(['name' => $data['name']], $data));

        PpmpItem::where('project_id', $project->id)->delete();
        PpmpDocument::where('project_id', $project->id)->delete();

        $ppmpRows = collect([
            [
                'expense_category' => 'TRAVELING EXPENSES',
                'general_description' => 'Provision of round-trip plane tickets for technical experts invited to conduct lectures, hands-on training, and consultation in relation to project activities.',
                'item_name' => 'Round-trip airfare for technical experts',
                'quantity_size' => "Round-trip airfare for technical experts, DOST Caraga personnel\nQuantity: 6 pax",
                'uom' => 'pax',
                'quantity' => 6,
                'procurement_start' => 'Aug-26',
                'procurement_end' => 'Aug-26',
                'delivery_period' => '09/2026',
                'estimated_budget' => 90000,
            ],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'Blue Liquid Gel Ink 0.5mm Sign Pen', 'quantity_size' => "Blue Liquid Gel Ink 0.5mm Sign Pen\nQuantity: 20 pieces", 'uom' => 'piece', 'quantity' => 20, 'estimated_budget' => 500],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'Backfold 19mm Binder Clip', 'quantity_size' => "Backfold 19mm Binder Clip\nQuantity: 20 pieces", 'uom' => 'piece', 'quantity' => 20, 'estimated_budget' => 500],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'Backfold 32mm Binder Clip', 'quantity_size' => "Backfold 32mm Binder Clip\nQuantity: 20 pieces", 'uom' => 'piece', 'quantity' => 20, 'estimated_budget' => 1000],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'Backfold 50mm Binder Clip', 'quantity_size' => "Backfold 50mm Binder Clip\nQuantity: 1 piece", 'uom' => 'piece', 'quantity' => 1, 'estimated_budget' => 2000],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'Standard Size Stapler', 'quantity_size' => "Standard Size Stapler\nQuantity: 15 boxes", 'uom' => 'box', 'quantity' => 15, 'estimated_budget' => 500],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'Standard Size Staple Wire', 'quantity_size' => "Standard Size Staple Wire\nQuantity: 5 pieces", 'uom' => 'piece', 'quantity' => 5, 'estimated_budget' => 1500],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'Chisel Tip Quick-Drying Highlighter', 'quantity_size' => "Chisel tip, neon-yellow/green/orange, quick-drying highlighter\nQuantity: 5 pieces", 'uom' => 'piece', 'quantity' => 5, 'estimated_budget' => 500],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'Green Legal Size Pressboard Folder', 'quantity_size' => "Green Legal Size Pressboard Folder\nQuantity: 10 packs", 'uom' => 'pack', 'quantity' => 10, 'estimated_budget' => 600],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'A4-sized Sticker Paper', 'quantity_size' => "A4-sized Sticker Paper\nQuantity: 20 boxes", 'uom' => 'box', 'quantity' => 20, 'estimated_budget' => 1000],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => '20 Boxes Plastic Coated Paper Clip', 'quantity_size' => "20 boxes of plastic coated/wired, 33mm Paper Clip\nQuantity: 10 pads", 'uom' => 'box', 'quantity' => 20, 'estimated_budget' => 400],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => '3x4 Sticky Note Pad', 'quantity_size' => "3x4 sticky notepad\nQuantity: 30 packs", 'uom' => 'pack', 'quantity' => 30, 'estimated_budget' => 600],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'Index Tab', 'quantity_size' => "Index Tab\nQuantity: 25 reams", 'uom' => 'ream', 'quantity' => 25, 'estimated_budget' => 1500],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'A4-sized Bond Paper', 'quantity_size' => "A4 sized Bond Paper\nQuantity: 5 reams", 'uom' => 'ream', 'quantity' => 5, 'estimated_budget' => 6500],
            ['expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies', 'general_description' => 'Supply and delivery of office supplies and materials for day-to-day operational use during the redevelopment/implementation of NOVA Hub.', 'item_name' => 'Legal-sized Bond Paper', 'quantity_size' => "Legal sized Bond Paper\nQuantity: 1 piece", 'uom' => 'ream', 'quantity' => 1, 'estimated_budget' => 1400],
            [
                'expense_category' => 'SUPPLIES AND MATERIALS EXPENSES - Office Supplies',
                'general_description' => 'Supply and delivery of air conditioner for daily use of MIS Office.',
                'item_name' => 'Split Type Inverter Air Conditioner 2.5HP',
                'quantity_size' => "Split Type Inverter, 220V/1-Phase/60Hz/R32 Refrigerant, 2.5 HP",
                'uom' => 'unit',
                'quantity' => 1,
                'procurement_start' => '03/2026',
                'procurement_end' => '03/2026',
                'delivery_period' => '04/2026',
                'estimated_budget' => 49900,
            ],
            [
                'expense_category' => 'ICT Supplies',
                'general_description' => 'Supply and delivery of ICT supplies for MIS Office connectivity.',
                'item_name' => 'WiFi Router',
                'quantity_size' => "WiFi Router\nQuantity: 2 units",
                'uom' => 'unit',
                'quantity' => 2,
                'estimated_budget' => 6000,
            ],
        ]);

        $ppmpDocument = PpmpDocument::updateOrCreate(
            ['project_id' => $project->id, 'ppmp_no' => 'PPMP-2026-MIS-003'],
            [
                'fiscal_year' => 2026,
                'end_user_unit' => 'MIS',
                'document_type' => 'Final',
                'source_filename' => 'sample-mis-ppmp-2026.xlsx',
                'prepared_submitted_by_name' => 'MIS Project Staff',
                'prepared_submitted_by_position' => 'Prepared & Submitted by',
                'prepared_submitted_by_date' => '2026-05-10',
                'budget_officer_name' => 'Budget Officer',
                'budget_officer_position' => 'Budget Officer',
                'budget_certified_date' => '2026-05-10',
                'row_count' => $ppmpRows->count(),
                'total_estimated_budget' => $ppmpRows->sum('estimated_budget'),
                'imported_by' => $admin->id,
                'imported_at' => now(),
            ],
        );

        $ppmpRows->each(function (array $row, int $index) use ($items, $project, $ppmpDocument): void {
            $item = $items->firstWhere('name', $row['item_name']);
            $quantity = (float) $row['quantity'];
            $estimatedBudget = (float) $row['estimated_budget'];

            PpmpItem::create([
                'ppmp_document_id' => $ppmpDocument->id,
                'project_id' => $project->id,
                'procurement_item_id' => $item->id,
                'row_number' => $index + 1,
                'code' => 'PPMP-2026-MIS-'.str_pad((string) ($index + 1), 3, '0', STR_PAD_LEFT),
                'expense_category' => $row['expense_category'],
                'general_description' => $row['general_description'],
                'project_type' => 'Goods',
                'quantity_size' => $row['quantity_size'],
                'recommended_mode' => 'Small Value Procurement',
                'pre_procurement_conference' => 'No',
                'procurement_start' => $row['procurement_start'] ?? 'Jan-26',
                'procurement_end' => $row['procurement_end'] ?? 'Jan-26',
                'delivery_period' => $row['delivery_period'] ?? '02/2026',
                'source_of_funds' => 'LGIA 2026 Current Appropriation-NOVA Hub',
                'estimated_budget' => $estimatedBudget,
                'quantity' => $quantity,
                'estimated_unit_cost' => $quantity > 0 ? $estimatedBudget / $quantity : $estimatedBudget,
                'schedule' => $row['delivery_period'] ?? '02/2026',
            ]);
        });

        AppCseItem::updateOrCreate(
            ['procurement_item_id' => $items->firstWhere('name', 'A4-sized Bond Paper')->id, 'project_id' => null],
            ['code' => 'CSE-001', 'quantity' => 500, 'unit_price' => 250],
        );

        foreach ($items->where('is_cse', false) as $item) {
            AppNonCseItem::updateOrCreate(
                ['procurement_item_id' => $item->id, 'project_id' => null],
                ['code' => 'NC-'.$item->id, 'quantity' => 20, 'estimated_cost' => 624000],
            );
        }

        BudgetAllocation::updateOrCreate(
            ['project_id' => $project->id, 'account_code' => '5021201000'],
            ['account_name' => 'ICT Equipment', 'allocated_amount' => 4200000, 'obligated_amount' => 2540000],
        );

        $pr = PurchaseRequest::updateOrCreate(['pr_no' => 'PR-2026-0142'], [
            'office_id' => $offices->firstWhere('code', 'RO')->id,
            'fund_source_id' => $gaa->id,
            'project_id' => $project->id,
            'requested_by' => $requester->id,
            'mode_of_procurement' => 'Shopping',
            'purpose' => 'Replacement of unserviceable office equipment for the Administrative Division.',
            'status' => 'Draft',
            'stage' => 'Draft',
        ]);

        $pr->items()->delete();
        $pr->items()->createMany([
            ['procurement_item_id' => $items->firstWhere('name', 'Laptop, Business Class')->id, 'name' => 'Laptop, Business Class', 'description' => 'i7, 16GB RAM, 512GB SSD', 'uom' => 'unit', 'quantity' => 3, 'unit_cost' => 52000],
            ['procurement_item_id' => $items->firstWhere('name', 'Wireless Mouse')->id, 'name' => 'Wireless Mouse', 'description' => 'Ergonomic, optical', 'uom' => 'pc', 'quantity' => 6, 'unit_cost' => 850],
        ]);
    }
}
