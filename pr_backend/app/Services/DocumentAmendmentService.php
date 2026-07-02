<?php

namespace App\Services;

use App\Models\LibEntry;
use App\Models\PpmpDocument;
use App\Models\PpmpItem;
use App\Models\PurchaseRequest;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DocumentAmendmentService
{
    public function __construct(
        private BudgetEnforcementService $budgetService,
    ) {}

    public function canAmend(Model $document): bool
    {
        return $document->status === 'Approved';
    }

    public function canCancel(Model $document): bool
    {
        if (in_array($document->status, ['Cancelled', 'Rejected'], true)) {
            return false;
        }

        if ($document instanceof LibEntry) {
            return ! PpmpItem::where('lib_entry_id', $document->id)
                ->whereHas('document', fn ($q) => $q->whereIn('status', ['Approved', 'Submitted']))
                ->exists();
        }

        if ($document instanceof PpmpDocument) {
            $hasEncumbrance = PpmpItem::where('ppmp_document_id', $document->id)
                ->where('encumbered_amount', '>', 0)
                ->exists();
            return ! $hasEncumbrance;
        }

        if ($document instanceof PurchaseRequest) {
            return ! in_array($document->stage, ['With BAC', 'With Supply Office', 'Processing'], true);
        }

        return false;
    }

    public function amend(Model $document): Model
    {
        if (! $this->canAmend($document)) {
            throw ValidationException::withMessages([
                'status' => ['Only approved documents can be amended.'],
            ]);
        }

        return DB::transaction(function () use ($document): Model {
            if ($document instanceof LibEntry) {
                return $this->amendLib($document);
            }

            if ($document instanceof PpmpDocument) {
                return $this->amendPpmp($document);
            }

            if ($document instanceof PurchaseRequest) {
                return $this->amendPr($document);
            }

            throw new \InvalidArgumentException('Unsupported document type for amendment.');
        });
    }

    public function cancel(Model $document, string $reason): void
    {
        if (! $this->canCancel($document)) {
            throw ValidationException::withMessages([
                'cancellation' => ['This document cannot be cancelled in its current state.'],
            ]);
        }

        DB::transaction(function () use ($document, $reason): void {
            $document->forceFill([
                'status' => 'Cancelled',
                'cancelled_at' => now(),
                'cancellation_reason' => $reason,
            ])->save();

            if ($document instanceof PpmpDocument) {
                $document->items->each(fn (PpmpItem $item) => $this->budgetService->restorePpmpToLib($item));
            }

            if ($document instanceof PurchaseRequest) {
                $document->loadMissing('items');
                $document->items->each(fn ($item) => $this->budgetService->releaseEncumbrance($item));
            }
        });
    }

    private function amendLib(LibEntry $lib): LibEntry
    {
        return LibEntry::create([
            'project_id' => $lib->project_id,
            'fund_source_id' => $lib->fund_source_id,
            'budget_year' => $lib->budget_year,
            'pap_code' => $lib->pap_code,
            'object_of_expenditure' => $lib->object_of_expenditure,
            'account_code' => $lib->account_code,
            'allocated_amount' => $lib->allocated_amount,
            'available_amount' => $lib->available_amount,
            'status' => 'Draft',
            'version' => $lib->version + 1,
            'parent_id' => $lib->id,
            'created_by' => $lib->created_by,
        ]);
    }

    private function amendPpmp(PpmpDocument $ppmp): PpmpDocument
    {
        $ppmp->loadMissing('items');

        $newDoc = PpmpDocument::create([
            'project_id' => $ppmp->project_id,
            'fund_source_id' => $ppmp->fund_source_id,
            'ppmp_no' => $ppmp->ppmp_no,
            'fiscal_year' => $ppmp->fiscal_year,
            'end_user_unit' => $ppmp->end_user_unit,
            'document_type' => $ppmp->document_type,
            'status' => 'Draft',
            'version' => $ppmp->version + 1,
            'parent_id' => $ppmp->id,
            'source_filename' => $ppmp->source_filename,
            'prepared_submitted_by_name' => $ppmp->prepared_submitted_by_name,
            'prepared_submitted_by_position' => $ppmp->prepared_submitted_by_position,
            'prepared_submitted_by_date' => $ppmp->prepared_submitted_by_date,
            'budget_officer_name' => $ppmp->budget_officer_name,
            'budget_officer_position' => $ppmp->budget_officer_position,
            'budget_certified_date' => $ppmp->budget_certified_date,
            'total_estimated_budget' => $ppmp->total_estimated_budget,
            'row_count' => $ppmp->row_count,
            'imported_by' => $ppmp->imported_by,
        ]);

        foreach ($ppmp->items as $item) {
            PpmpItem::create([
                'ppmp_document_id' => $newDoc->id,
                'lib_entry_id' => $item->lib_entry_id,
                'fund_source_id' => $item->fund_source_id,
                'project_id' => $item->project_id,
                'procurement_item_id' => $item->procurement_item_id,
                'row_number' => $item->row_number,
                'code' => $item->code,
                'expense_category' => $item->expense_category,
                'general_description' => $item->general_description,
                'project_type' => $item->project_type,
                'quantity_size' => $item->quantity_size,
                'recommended_mode' => $item->recommended_mode,
                'pre_procurement_conference' => $item->pre_procurement_conference,
                'procurement_start' => $item->procurement_start,
                'procurement_end' => $item->procurement_end,
                'delivery_period' => $item->delivery_period,
                'source_of_funds' => $item->source_of_funds,
                'estimated_budget' => $item->estimated_budget,
                'encumbered_amount' => 0,
                'supporting_documents' => $item->supporting_documents,
                'remarks' => $item->remarks,
                'quantity' => $item->quantity,
                'estimated_unit_cost' => $item->estimated_unit_cost,
                'schedule' => $item->schedule,
            ]);
        }

        return $newDoc;
    }

    private function amendPr(PurchaseRequest $pr): PurchaseRequest
    {
        $pr->loadMissing('items');

        $newPr = PurchaseRequest::create([
            'pr_no' => $pr->pr_no . '-A' . ($pr->version + 1),
            'office_id' => $pr->office_id,
            'fund_source_id' => $pr->fund_source_id,
            'project_id' => $pr->project_id,
            'requested_by' => $pr->requested_by,
            'mode_of_procurement' => $pr->mode_of_procurement,
            'purpose' => $pr->purpose,
            'status' => 'Draft',
            'stage' => 'Draft',
            'version' => $pr->version + 1,
            'parent_id' => $pr->id,
        ]);

        foreach ($pr->items as $item) {
            $newPr->items()->create([
                'procurement_item_id' => $item->procurement_item_id,
                'ppmp_item_id' => $item->ppmp_item_id,
                'name' => $item->name,
                'description' => $item->description,
                'uom' => $item->uom,
                'quantity' => $item->quantity,
                'unit_cost' => $item->unit_cost,
            ]);
        }

        return $newPr;
    }
}
