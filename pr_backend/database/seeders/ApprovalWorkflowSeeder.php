<?php

namespace Database\Seeders;

use App\Models\ApprovalWorkflow;
use Illuminate\Database\Seeder;

class ApprovalWorkflowSeeder extends Seeder
{
    public function run(): void
    {
        $workflows = [
            // LIB Approval: Budget Officer → Department Head → Approving Authority
            ['document_type' => 'lib', 'stage_order' => 1, 'stage_name' => 'Budget Officer Review', 'required_role' => 'Budget Officer', 'description' => 'Budget Officer reviews and validates the LIB entry.', 'is_final' => false],
            ['document_type' => 'lib', 'stage_order' => 2, 'stage_name' => 'Department Head Endorsement', 'required_role' => 'Department Head', 'description' => 'Department Head endorses the LIB entry.', 'is_final' => false],
            ['document_type' => 'lib', 'stage_order' => 3, 'stage_name' => 'Approving Authority', 'required_role' => 'Approving Authority', 'description' => 'Final approval of the LIB entry.', 'is_final' => true],

            // PPMP Approval: End-user Unit Head → Budget Officer → Approving Authority
            ['document_type' => 'ppmp', 'stage_order' => 1, 'stage_name' => 'Unit Head Review', 'required_role' => 'Unit Head', 'description' => 'End-user Unit Head reviews the PPMP.', 'is_final' => false],
            ['document_type' => 'ppmp', 'stage_order' => 2, 'stage_name' => 'Budget Officer Certification', 'required_role' => 'Budget Officer', 'description' => 'Budget Officer certifies fund availability.', 'is_final' => false],
            ['document_type' => 'ppmp', 'stage_order' => 3, 'stage_name' => 'Approving Authority', 'required_role' => 'Approving Authority', 'description' => 'Final approval of the PPMP.', 'is_final' => true],

            // PR Approval: Requesting Officer → Unit Head → Budget Officer → Approving Authority
            ['document_type' => 'purchase_request', 'stage_order' => 1, 'stage_name' => 'Requesting Officer Submission', 'required_role' => 'Requesting Officer', 'description' => 'Requesting Officer submits the PR.', 'is_final' => false],
            ['document_type' => 'purchase_request', 'stage_order' => 2, 'stage_name' => 'Unit Head Recommendation', 'required_role' => 'Unit Head', 'description' => 'Unit Head recommends the PR.', 'is_final' => false],
            ['document_type' => 'purchase_request', 'stage_order' => 3, 'stage_name' => 'Budget Officer Certification', 'required_role' => 'Budget Officer', 'description' => 'Budget Officer certifies fund availability.', 'is_final' => false],
            ['document_type' => 'purchase_request', 'stage_order' => 4, 'stage_name' => 'Approving Authority', 'required_role' => 'Approving Authority', 'description' => 'Final approval of the Purchase Request.', 'is_final' => true],
        ];

        foreach ($workflows as $workflow) {
            ApprovalWorkflow::updateOrCreate(
                ['document_type' => $workflow['document_type'], 'stage_order' => $workflow['stage_order']],
                $workflow
            );
        }
    }
}
