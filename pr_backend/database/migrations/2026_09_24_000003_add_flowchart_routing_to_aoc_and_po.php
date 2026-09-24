<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Brings the Abstract of Canvas and Purchase Order onto the flowchart's orange and yellow lanes:
 *  - venue_ratings + venue_rating_summary: "Individual rating of list of venue" -> "Summary of rating".
 *  - supply_noted_*: "AOC returned to supply to note lowest bidder", now its own signed step.
 *  - purchase_orders portal fields: "Forward signed PO to Supplier Portal" and the supplier's
 *    delivery answer ("Does supplier waive to deliver?").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('abstract_of_canvases', function (Blueprint $table): void {
            $table->json('venue_rating_summary')->nullable()->after('twg_response');
            $table->foreignId('supply_noted_by')->nullable()->after('venue_rating_summary')->constrained('users')->nullOnDelete();
            $table->string('supply_noted_name')->nullable()->after('supply_noted_by');
            $table->timestamp('supply_noted_at')->nullable()->after('supply_noted_name');
            $table->timestamp('bac_approved_at')->nullable()->after('supply_noted_at');
        });

        Schema::create('venue_ratings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('abstract_of_canvas_id')->constrained('abstract_of_canvases')->cascadeOnDelete();
            $table->foreignId('rfq_supplier_id')->constrained('rfq_suppliers')->cascadeOnDelete();
            $table->foreignId('rater_id')->constrained('users')->cascadeOnDelete();
            $table->string('rater_role'); // TWG Lead | End-user | Supply Officer
            $table->string('criterion');
            $table->unsignedTinyInteger('score'); // 1-5
            $table->text('remarks')->nullable();
            $table->timestamps();
            $table->unique(['abstract_of_canvas_id', 'rfq_supplier_id', 'rater_id', 'criterion'], 'venue_ratings_unique_score');
        });

        Schema::table('purchase_orders', function (Blueprint $table): void {
            $table->string('supplier_email')->nullable()->after('supplier_tin');
            $table->timestamp('forwarded_to_supplier_at')->nullable()->after('approved_by_signed_at');
            $table->string('portal_token_hash', 64)->nullable()->unique()->after('forwarded_to_supplier_at');
            $table->timestamp('delivery_accepted_at')->nullable()->after('delivery_waived_reason');
            $table->string('delivery_responded_by')->nullable()->after('delivery_accepted_at'); // Supplier (portal) or the staff member
        });

        // A BAC-approved AOC now goes back to Supply to note the lowest bidder before a PO is made.
        // One that already has a PO was, in effect, noted; the rest wait for the Supply Officer.
        $withPo = DB::table('purchase_orders')->pluck('rfq_id')->all();
        DB::table('abstract_of_canvases')->where('status', 'Approved')->whereIn('rfq_id', $withPo)->update(['status' => 'Lowest Bidder Noted']);
        DB::table('abstract_of_canvases')->where('status', 'Approved')->update(['status' => 'For Supply Noting']);
    }

    public function down(): void
    {
        DB::table('abstract_of_canvases')->whereIn('status', ['For Supply Noting', 'Lowest Bidder Noted'])->update(['status' => 'Approved']);

        Schema::table('purchase_orders', function (Blueprint $table): void {
            $table->dropUnique(['portal_token_hash']);
            $table->dropColumn(['supplier_email', 'forwarded_to_supplier_at', 'portal_token_hash', 'delivery_accepted_at', 'delivery_responded_by']);
        });

        Schema::dropIfExists('venue_ratings');

        Schema::table('abstract_of_canvases', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('supply_noted_by');
            $table->dropColumn(['venue_rating_summary', 'supply_noted_name', 'supply_noted_at', 'bac_approved_at']);
        });
    }
};
