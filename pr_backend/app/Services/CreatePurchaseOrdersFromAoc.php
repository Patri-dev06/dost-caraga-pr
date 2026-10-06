<?php

namespace App\Services;

use App\Models\AbstractOfCanvas;
use App\Models\PurchaseOrder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** Creates one Draft Purchase Order for every supplier awarded at least one AOC line item. */
class CreatePurchaseOrdersFromAoc
{
    /** @return Collection<int, PurchaseOrder> */
    public function create(AbstractOfCanvas $aoc, int $createdBy): Collection
    {
        return DB::transaction(function () use ($aoc, $createdBy): Collection {
            $locked = AbstractOfCanvas::query()->lockForUpdate()->findOrFail($aoc->id);
            $locked->loadMissing([
                'rfq.purchaseRequest',
                'rfq.purchaseOrders',
                'itemAwards.rfqItem',
                'itemAwards.winningSupplier.quoteItems',
            ]);

            if ($locked->rfq->purchaseOrders->isNotEmpty()) {
                return $locked->rfq->purchaseOrders->sortBy('id')->values();
            }

            abort_unless($locked->status === 'Lowest Bidder Noted', 422,
                'Purchase Orders are created only after Supply notes the approved item awards.');
            abort_if($locked->itemAwards->isEmpty(), 422, 'This Abstract of Canvass has no item awards.');
            abort_if($locked->itemAwards->contains(fn ($award) => $award->winning_rfq_supplier_id === null),
                422, 'Every item must have a winning supplier before Purchase Orders are created.');

            $orders = collect();
            foreach ($locked->itemAwards->groupBy('winning_rfq_supplier_id') as $supplierId => $awards) {
                $supplier = $awards->first()->winningSupplier;
                abort_if($supplier === null, 422, 'An awarded supplier no longer exists.');

                $po = PurchaseOrder::create([
                    'po_no' => $this->nextPoNo(),
                    'purchase_request_id' => $locked->rfq->purchase_request_id,
                    'rfq_id' => $locked->rfq_id,
                    'supplier_name' => $supplier->supplier_name,
                    'supplier_address' => $supplier->supplier_address,
                    'supplier_contact_no' => $supplier->supplier_contact_no,
                    'supplier_tin' => $supplier->supplier_tin,
                    'supplier_email' => $supplier->supplier_email,
                    'place_of_delivery' => $locked->rfq->place_of_delivery,
                    'mode_of_procurement' => $locked->rfq->purchaseRequest?->mode_of_procurement,
                    'total_amount' => $awards->sum(fn ($award) => (float) $award->awarded_total_price),
                    'status' => 'Draft',
                    'stage' => 'Draft',
                    'created_by' => $createdBy,
                ]);

                $po->items()->createMany($awards->sortBy(fn ($award) => $award->rfqItem?->item_no)->values()
                    ->map(function ($award, int $index): array {
                        $item = $award->rfqItem;

                        return [
                            'rfq_item_id' => $award->rfq_item_id,
                            'item_no' => $item?->item_no ?: $index + 1,
                            'description' => $item?->description,
                            'uom' => $item?->uom,
                            'quantity' => $item?->quantity ?? 0,
                            'unit_cost' => $award->awarded_unit_price ?? 0,
                            'total_cost' => $award->awarded_total_price ?? 0,
                        ];
                    })->all());

                $orders->push($po);
            }

            return $orders;
        });
    }

    private function nextPoNo(): string
    {
        $year = now()->year;
        $lastNo = PurchaseOrder::where('po_no', 'like', "PO-{$year}-%")
            ->orderByRaw('CAST(SUBSTRING(po_no FROM \'[0-9]+$\') AS INTEGER) DESC')
            ->lockForUpdate()
            ->value('po_no');
        $lastSeq = $lastNo ? (int) preg_replace('/\D/', '', substr((string) $lastNo, strlen("PO-{$year}-"))) : 0;

        return sprintf('PO-%d-%04d', $year, $lastSeq + 1);
    }
}
