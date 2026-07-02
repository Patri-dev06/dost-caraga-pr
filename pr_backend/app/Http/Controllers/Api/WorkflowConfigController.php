<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WorkflowConfigController extends Controller
{
    public function index(): JsonResponse
    {
        $workflows = ApprovalWorkflow::orderBy('document_type')
            ->orderBy('stage_order')
            ->get()
            ->groupBy('document_type');

        return response()->json(['data' => $workflows]);
    }

    public function update(Request $request): JsonResponse
    {
        abort_unless(
            $request->user()?->roles->contains('name', 'Admin'),
            403,
            'Only administrators can update workflow configuration.'
        );

        $data = $request->validate([
            'stages' => ['required', 'array', 'min:1'],
            'stages.*.id' => ['nullable', 'exists:approval_workflows,id'],
            'stages.*.document_type' => ['required', 'string', 'in:lib,ppmp,purchase_request'],
            'stages.*.stage_order' => ['required', 'integer', 'min:1'],
            'stages.*.stage_name' => ['required', 'string', 'max:100'],
            'stages.*.required_role' => ['required', 'string', 'max:100'],
            'stages.*.description' => ['nullable', 'string'],
            'stages.*.is_final' => ['required', 'boolean'],
        ]);

        foreach ($data['stages'] as $stage) {
            ApprovalWorkflow::updateOrCreate(
                ['id' => $stage['id'] ?? null],
                [
                    'document_type' => $stage['document_type'],
                    'stage_order' => $stage['stage_order'],
                    'stage_name' => $stage['stage_name'],
                    'required_role' => $stage['required_role'],
                    'description' => $stage['description'] ?? null,
                    'is_final' => $stage['is_final'],
                ]
            );
        }

        return $this->index();
    }
}
