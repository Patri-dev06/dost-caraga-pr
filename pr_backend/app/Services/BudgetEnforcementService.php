<?php

namespace App\Services;

use App\Models\LibEntry;
use App\Models\PpmpItem;
use App\Models\PurchaseRequestItem;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BudgetEnforcementService
{
    public function libAvailableAmount(LibEntry $lib): float
    {
        $committed = PpmpItem::where('lib_entry_id', $lib->id)
            ->whereHas('document', fn ($q) => $q->whereIn('status', ['Approved', 'Submitted']))
            ->sum('estimated_budget');

        return (float) $lib->allocated_amount - (float) $committed;
    }

    public function ppmpAvailableAmount(PpmpItem $ppmpItem): float
    {
        return (float) $ppmpItem->estimated_budget - (float) $ppmpItem->encumbered_amount;
    }

    public function validatePpmpAllocation(int $libEntryId, float $amount, ?int $excludePpmpItemId = null): void
    {
        DB::transaction(function () use ($libEntryId, $amount, $excludePpmpItemId): void {
            $lib = LibEntry::lockForUpdate()->findOrFail($libEntryId);

            if ($lib->status !== 'Approved') {
                throw ValidationException::withMessages([
                    'lib_entry_id' => ['The linked LIB entry must be in Approved status.'],
                ]);
            }

            $committed = PpmpItem::where('lib_entry_id', $lib->id)
                ->when($excludePpmpItemId, fn ($q) => $q->where('id', '!=', $excludePpmpItemId))
                ->whereHas('document', fn ($q) => $q->whereIn('status', ['Approved', 'Submitted', 'Draft']))
                ->sum('estimated_budget');

            $available = (float) $lib->allocated_amount - (float) $committed;

            if ($amount > $available) {
                throw ValidationException::withMessages([
                    'estimated_budget' => [
                        "Amount exceeds available LIB balance. Available: " . number_format($available, 2) .
                        ", Requested: " . number_format($amount, 2) .
                        ", LIB Allocated: " . number_format((float) $lib->allocated_amount, 2),
                    ],
                ]);
            }
        });
    }

    public function validatePrAllocation(int $ppmpItemId, float $amount, ?int $excludePrItemId = null): void
    {
        DB::transaction(function () use ($ppmpItemId, $amount, $excludePrItemId): void {
            $ppmpItem = PpmpItem::lockForUpdate()->findOrFail($ppmpItemId);

            $document = $ppmpItem->document;
            if ($document && $document->status !== 'Approved') {
                throw ValidationException::withMessages([
                    'ppmp_item_id' => ['The linked PPMP must be in Approved status.'],
                ]);
            }

            $encumbered = PurchaseRequestItem::where('ppmp_item_id', $ppmpItem->id)
                ->when($excludePrItemId, fn ($q) => $q->where('id', '!=', $excludePrItemId))
                ->whereHas('purchaseRequest', fn ($q) => $q->whereNotIn('status', ['Cancelled', 'Rejected']))
                ->sum(DB::raw('quantity * unit_cost'));

            $available = (float) $ppmpItem->estimated_budget - (float) $encumbered;

            if ($amount > $available) {
                throw ValidationException::withMessages([
                    'ppmp_item_id' => [
                        "Amount exceeds available PPMP balance. Available: " . number_format($available, 2) .
                        ", Requested: " . number_format($amount, 2) .
                        ", PPMP Budget: " . number_format((float) $ppmpItem->estimated_budget, 2),
                    ],
                ]);
            }
        });
    }

    public function encumberForPr(PurchaseRequestItem $prItem): void
    {
        if (! $prItem->ppmp_item_id) {
            return;
        }

        DB::transaction(function () use ($prItem): void {
            $ppmpItem = PpmpItem::lockForUpdate()->findOrFail($prItem->ppmp_item_id);
            $amount = (float) $prItem->quantity * (float) $prItem->unit_cost;
            $ppmpItem->increment('encumbered_amount', $amount);
        });
    }

    public function releaseEncumbrance(PurchaseRequestItem $prItem): void
    {
        if (! $prItem->ppmp_item_id) {
            return;
        }

        DB::transaction(function () use ($prItem): void {
            $ppmpItem = PpmpItem::lockForUpdate()->findOrFail($prItem->ppmp_item_id);
            $amount = (float) $prItem->quantity * (float) $prItem->unit_cost;
            $ppmpItem->decrement('encumbered_amount', min($amount, (float) $ppmpItem->encumbered_amount));
        });
    }

    public function restorePpmpToLib(PpmpItem $ppmpItem): void
    {
        if (! $ppmpItem->lib_entry_id) {
            return;
        }

        DB::transaction(function () use ($ppmpItem): void {
            $lib = LibEntry::lockForUpdate()->findOrFail($ppmpItem->lib_entry_id);
            $lib->increment('available_amount', (float) $ppmpItem->estimated_budget);
        });
    }

    public function recalculateLibAvailable(LibEntry $lib): void
    {
        DB::transaction(function () use ($lib): void {
            $lib = LibEntry::lockForUpdate()->findOrFail($lib->id);

            $committed = PpmpItem::where('lib_entry_id', $lib->id)
                ->whereHas('document', fn ($q) => $q->whereIn('status', ['Approved', 'Submitted']))
                ->sum('estimated_budget');

            $lib->forceFill([
                'available_amount' => (float) $lib->allocated_amount - (float) $committed,
            ])->save();
        });
    }

    public function recalculatePpmpEncumbered(PpmpItem $ppmpItem): void
    {
        DB::transaction(function () use ($ppmpItem): void {
            $ppmpItem = PpmpItem::lockForUpdate()->findOrFail($ppmpItem->id);

            $encumbered = PurchaseRequestItem::where('ppmp_item_id', $ppmpItem->id)
                ->whereHas('purchaseRequest', fn ($q) => $q->whereNotIn('status', ['Cancelled', 'Rejected']))
                ->sum(DB::raw('quantity * unit_cost'));

            $ppmpItem->forceFill(['encumbered_amount' => $encumbered])->save();
        });
    }
}
