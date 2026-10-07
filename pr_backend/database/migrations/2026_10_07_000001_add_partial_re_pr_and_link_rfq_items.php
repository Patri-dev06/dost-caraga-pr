<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_requests', function (Blueprint $table): void {
            // Set on a Re-PR that re-files only one waived Purchase Order's items (a partial Re-PR).
            $table->foreignId('re_pr_of_purchase_order_id')->nullable()->after('re_pr_of_id')->constrained('purchase_orders')->nullOnDelete();
        });

        // RFQ lines were never linked to the PR lines they canvass; link them so a waived supplier's
        // items can be traced back to the PR. An RFQ lists the PR's items in the PR's order, so a line
        // count match links by position; otherwise a unique name match on the line's first row.
        foreach (DB::table('rfqs')->select('id', 'purchase_request_id')->orderBy('id')->get() as $rfq) {
            $prItems = DB::table('purchase_request_items')->where('purchase_request_id', $rfq->purchase_request_id)->orderBy('id')->get();
            $rfqItems = DB::table('rfq_items')->where('rfq_id', $rfq->id)->orderBy('item_no')->orderBy('id')->get();
            $sameCount = $prItems->count() === $rfqItems->count();
            $byName = $prItems->groupBy(fn ($item) => mb_strtolower(trim((string) $item->name)));

            foreach ($rfqItems->values() as $index => $rfqItem) {
                if ($rfqItem->purchase_request_item_id !== null) {
                    continue;
                }

                $prItemId = null;
                if ($sameCount) {
                    $prItemId = $prItems[$index]->id;
                } else {
                    $firstLine = mb_strtolower(trim(explode("\n", (string) $rfqItem->description)[0]));
                    $matches = $byName->get($firstLine);
                    if ($matches !== null && $matches->count() === 1) {
                        $prItemId = $matches->first()->id;
                    }
                }

                if ($prItemId !== null) {
                    DB::table('rfq_items')->where('id', $rfqItem->id)->update(['purchase_request_item_id' => $prItemId]);
                }
            }
        }
    }

    public function down(): void
    {
        Schema::table('purchase_requests', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('re_pr_of_purchase_order_id');
        });
    }
};
