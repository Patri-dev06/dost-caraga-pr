<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rfq_quote_items', function (Blueprint $table): void {
            $table->string('offer_status')->default('Quoted')->after('total_price'); // Quoted | No Bid
            $table->boolean('aoc_complies')->nullable()->after('offer_status');
            $table->text('aoc_remarks')->nullable()->after('aoc_complies');
        });

        Schema::table('abstract_of_canvases', function (Blueprint $table): void {
            // Frozen when the AOC is generated so a historical form never changes with Settings.
            $table->json('signatory_snapshot')->nullable()->after('venue_rating_summary');
        });

        Schema::create('abstract_of_canvas_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('abstract_of_canvas_id')->constrained('abstract_of_canvases')->cascadeOnDelete();
            $table->foreignId('rfq_item_id')->constrained('rfq_items')->cascadeOnDelete();
            $table->foreignId('winning_rfq_supplier_id')->nullable()->constrained('rfq_suppliers')->nullOnDelete();
            $table->decimal('awarded_unit_price', 14, 2)->nullable();
            $table->decimal('awarded_total_price', 14, 2)->nullable();
            $table->text('selection_reason')->nullable();
            $table->timestamps();
            $table->unique(['abstract_of_canvas_id', 'rfq_item_id'], 'aoc_item_unique');
        });

        // Preserve quotations already recorded before explicit NONE/compliance fields existed.
        // Goods and Venue offers were treated as compliant by the former workflow; Equipment keeps
        // the TWG's recorded item decision.
        DB::table('rfq_quote_items')->whereNull('unit_price')->update(['offer_status' => 'No Bid']);
        $nonEquipmentSupplierIds = DB::table('rfq_suppliers')
            ->join('rfqs', 'rfqs.id', '=', 'rfq_suppliers.rfq_id')
            ->where('rfqs.procurement_category', '!=', 'Equipment')
            ->select('rfq_suppliers.id');
        DB::table('rfq_quote_items')
            ->whereNotNull('unit_price')
            ->whereIn('rfq_supplier_id', $nonEquipmentSupplierIds)
            ->update(['aoc_complies' => true]);
        $equipmentSupplierIds = DB::table('rfq_suppliers')
            ->join('rfqs', 'rfqs.id', '=', 'rfq_suppliers.rfq_id')
            ->where('rfqs.procurement_category', 'Equipment')
            ->select('rfq_suppliers.id');
        DB::table('rfq_quote_items')
            ->whereNotNull('unit_price')
            ->whereNotNull('twg_complies')
            ->whereIn('rfq_supplier_id', $equipmentSupplierIds)
            ->update(['aoc_complies' => DB::raw('twg_complies')]);

        // Existing installations may already have AOCs. Preserve their former whole-quote winner
        // as one item award per RFQ line so historical records remain usable after this migration.
        DB::table('abstract_of_canvases')->orderBy('id')->each(function ($aoc): void {
            if ($aoc->winning_rfq_supplier_id === null) {
                return;
            }

            $items = DB::table('rfq_items')->where('rfq_id', $aoc->rfq_id)->get();
            $quotes = DB::table('rfq_quote_items')
                ->where('rfq_supplier_id', $aoc->winning_rfq_supplier_id)
                ->get()
                ->keyBy('rfq_item_id');

            foreach ($items as $item) {
                $quote = $quotes->get($item->id);
                DB::table('abstract_of_canvas_items')->insert([
                    'abstract_of_canvas_id' => $aoc->id,
                    'rfq_item_id' => $item->id,
                    'winning_rfq_supplier_id' => $aoc->winning_rfq_supplier_id,
                    'awarded_unit_price' => $quote?->unit_price,
                    'awarded_total_price' => $quote?->total_price,
                    'selection_reason' => 'Migrated from the former whole-quotation award.',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('abstract_of_canvas_items');

        Schema::table('abstract_of_canvases', function (Blueprint $table): void {
            $table->dropColumn('signatory_snapshot');
        });

        Schema::table('rfq_quote_items', function (Blueprint $table): void {
            $table->dropColumn(['offer_status', 'aoc_complies', 'aoc_remarks']);
        });
    }
};
