<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The real Abstract of Canvass awards item by item, not supplier by supplier: one canvass can split
 * 23 items across three suppliers, each winning the lines it quoted best on. The award is also not
 * simply the lowest price — a cheaper quote that fails the specification is passed over, and the
 * form says so in as many words ("Item No. 1 offered by KIMSON COMMERCIAL is non-compliant").
 *
 * `rfq_quote_items.is_awarded` carries that per-line decision. `abstract_of_canvases.
 * winning_rfq_supplier_id` stays as the supplier holding the largest share of the award, so the
 * existing queues, notifications and summaries keep working, but it is no longer the whole story.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rfq_quote_items', function (Blueprint $table): void {
            $table->boolean('is_awarded')->default(false)->after('twg_remarks');
            // Why this line went to a supplier that was not the cheapest, printed under the award.
            $table->text('award_remarks')->nullable()->after('is_awarded');
            $table->index(['rfq_item_id', 'is_awarded']);
        });

        // Existing AOCs awarded a single supplier everything: mark that supplier's lines as awarded
        // so the printed form and the Purchase Orders read the same before and after this change.
        DB::statement(<<<'SQL'
            UPDATE rfq_quote_items
               SET is_awarded = true
             WHERE rfq_supplier_id IN (
                   SELECT winning_rfq_supplier_id
                     FROM abstract_of_canvases
                    WHERE winning_rfq_supplier_id IS NOT NULL
               )
        SQL);
    }

    public function down(): void
    {
        Schema::table('rfq_quote_items', function (Blueprint $table): void {
            $table->dropIndex(['rfq_item_id', 'is_awarded']);
            $table->dropColumn(['is_awarded', 'award_remarks']);
        });
    }
};
