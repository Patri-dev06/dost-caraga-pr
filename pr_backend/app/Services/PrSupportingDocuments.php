<?php

namespace App\Services;

use App\Models\LibDocument;
use App\Models\LibDocumentRow;
use App\Models\PpmpDocument;
use App\Models\PpmpItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestSupportingDocument;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Supplementary Documents (SD) attached to a Purchase Request when it is submitted.
 *
 * Each SD is a frozen copy of the source document as it stood at submission — the PPMP can be
 * revised or superseded later, but the approvers keep seeing exactly what the PR was filed against.
 * Anyone who can see the PR can read its SDs, even when the PPMP/LIB itself is private to its owner.
 *
 * TODO(clarify): only the PPMP and the LIB behind it are attached for now. Which OTHER supplementary
 * documents a PR needs is still to be confirmed with the Supply Unit / BAC — e.g. technical
 * specifications, market study or price quotations, Terms of Reference, approved request letter —
 * and whether that depends on the mode of procurement or the amount. Add each confirmed type to
 * TYPES and to attach() (or, for uploaded files, a separate upload endpoint) once it is known.
 */
final class PrSupportingDocuments
{
    /** type => what the SD is called on the PR and the monitoring sheet. */
    public const TYPES = [
        'PPMP' => 'Project Procurement Management Plan',
        'LIB' => 'Line-Item Budget',
    ];

    /**
     * (Re)attaches the PR's SDs from what it is charged to right now: its PPMP and, for a Project
     * PPMP, the LIB behind it. A resubmission after a return replaces the earlier copies.
     *
     * @return Collection<int, PurchaseRequestSupportingDocument>
     */
    public static function attach(PurchaseRequest $pr, ?User $by): Collection
    {
        $pr->loadMissing('ppmpDocument.items', 'ppmpDocument.libDocument.rows');
        $ppmp = $pr->ppmpDocument;
        $lib = $ppmp?->libDocument;

        return DB::transaction(function () use ($pr, $by, $ppmp, $lib): Collection {
            $pr->supportingDocuments()->delete();
            $base = ['attached_by' => $by?->id, 'attached_at' => now()];

            if ($ppmp) {
                $pr->supportingDocuments()->create($base + self::fromPpmp($ppmp));
            }
            if ($lib) {
                $pr->supportingDocuments()->create($base + self::fromLib($lib));
            }

            return $pr->supportingDocuments()->get();
        });
    }

    /** @return array<string, mixed> */
    private static function fromPpmp(PpmpDocument $ppmp): array
    {
        $items = $ppmp->items->sortBy([['row_number', 'asc'], ['id', 'asc']])->values();
        $total = (float) $items->sum('estimated_budget');
        $reference = trim('PPMP '.$ppmp->ppmp_no.($ppmp->revision_count > 0 ? " · Revision {$ppmp->revision_count}" : ''));

        return [
            'type' => 'PPMP',
            'source_id' => $ppmp->id,
            'source_uid' => $ppmp->client_uid,
            'reference' => $reference,
            'title' => $ppmp->libDocument?->project_title ?: ($ppmp->end_user_unit ?: $ppmp->chargeable_to),
            'total' => $total,
            'snapshot' => [
                'ppmp_no' => $ppmp->ppmp_no,
                'revision' => (int) $ppmp->revision_count,
                'status' => $ppmp->status,
                'fiscal_year' => $ppmp->fiscal_year,
                'document_type' => $ppmp->document_type,
                'ppmp_class' => $ppmp->ppmp_class,
                'end_user_unit' => $ppmp->end_user_unit,
                'chargeable_to' => $ppmp->chargeable_to,
                'prepared_by' => $ppmp->prepared_submitted_by_name,
                'certified_by' => $ppmp->budget_officer_name,
                'certified_date' => $ppmp->budget_certified_date?->toDateString(),
                'total' => $total,
                'items' => $items->map(fn (PpmpItem $item): array => [
                    'item_name' => $item->item_name,
                    'general_description' => $item->general_description,
                    'expense_category' => $item->expense_category,
                    'quantity' => (float) $item->quantity,
                    'recommended_mode' => $item->recommended_mode,
                    'procurement_start' => $item->procurement_start,
                    'procurement_end' => $item->procurement_end,
                    'estimated_budget' => (float) $item->estimated_budget,
                ])->all(),
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function fromLib(LibDocument $lib): array
    {
        $amount = fn (mixed $value): float => (float) str_replace([',', '₱', ' '], '', (string) $value);
        $rows = $lib->rows->map(function (LibDocumentRow $row) use ($amount): array {
            // The amount in force: the latest reprogramming round, else the approved amount.
            $rounds = collect($row->reprogrammings ?? [])->pluck('amount')->filter(fn ($a) => $a !== null && $a !== '');

            return [
                'label' => $row->label,
                'note' => $row->note,
                'indent' => (int) $row->indent,
                'header' => (bool) $row->header,
                'approved' => $amount($row->approved),
                'current' => $rounds->isNotEmpty() ? $amount($rounds->last()) : $amount($row->approved),
            ];
        })->values();
        $total = (float) $rows->sum('approved');

        return [
            'type' => 'LIB',
            'source_id' => $lib->id,
            'source_uid' => $lib->client_uid,
            'reference' => 'LIB '.($lib->fiscal_year ? "CY {$lib->fiscal_year}" : '').((int) $lib->revision > 0 ? " · Reprogrammed Rev {$lib->revision}" : ''),
            'title' => $lib->project_title,
            'total' => $total,
            'snapshot' => [
                'project_title' => $lib->project_title,
                'program_title' => $lib->program_title,
                'fiscal_year' => $lib->fiscal_year,
                'revision' => (int) $lib->revision,
                'status' => $lib->status,
                'implementing_agency' => $lib->implementing_agency,
                'project_leader' => $lib->project_leader,
                'total_duration' => $lib->total_duration,
                'approved_by' => $lib->approved_name,
                'total' => $total,
                'rows' => $rows->all(),
            ],
        ];
    }

    /** "PPMP, LIB" — what the monitoring sheet's "SD Attached" column shows. */
    public static function summary(Collection $documents): ?string
    {
        return $documents->pluck('type')->implode(', ') ?: null;
    }
}
