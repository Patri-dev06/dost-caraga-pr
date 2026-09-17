<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Restructures the RFQ/PO module from a single-supplier-per-RFQ model to the
 * real target process: one RFQ canvass = exactly 3 suppliers, tracked
 * independently, feeding an Abstract of Canvas (AOC) that BAC reviews before a
 * PO is generated. Safe to restructure in place — no production data exists
 * in these tables yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('address')->nullable();
            $table->string('contact_no')->nullable();
            $table->string('tin')->nullable();
            $table->string('category')->default('Goods'); // Goods | Services
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::table('rfqs', function (Blueprint $table): void {
            // The single-supplier snapshot fields are superseded by the
            // rfq_suppliers table (one row per canvassed supplier).
            $table->dropColumn(['supplier_name', 'supplier_address', 'supplier_by', 'supplier_contact_no', 'supplier_tin']);

            $table->string('procurement_category')->default('Goods')->after('purchase_request_id'); // Goods | Equipment | Venue (Venue stubbed for now)

            // Pre-send signing chain: BAC Chair -> BAC Vice-chair -> Supply Officer,
            // required before the RFQ can be sent to suppliers.
            $table->foreignId('bac_chair_signed_by')->nullable()->after('bac_action')->constrained('users')->nullOnDelete();
            $table->string('bac_chair_signed_name')->nullable()->after('bac_chair_signed_by');
            $table->timestamp('bac_chair_signed_at')->nullable()->after('bac_chair_signed_name');
            $table->foreignId('bac_vice_chair_signed_by')->nullable()->after('bac_chair_signed_at')->constrained('users')->nullOnDelete();
            $table->string('bac_vice_chair_signed_name')->nullable()->after('bac_vice_chair_signed_by');
            $table->timestamp('bac_vice_chair_signed_at')->nullable()->after('bac_vice_chair_signed_name');
            $table->foreignId('supply_officer_signed_by')->nullable()->after('bac_vice_chair_signed_at')->constrained('users')->nullOnDelete();
            $table->string('supply_officer_signed_name')->nullable()->after('supply_officer_signed_by');
            $table->timestamp('supply_officer_signed_at')->nullable()->after('supply_officer_signed_name');
        });

        Schema::table('rfq_items', function (Blueprint $table): void {
            // Per-supplier pricing now lives in rfq_quote_items.
            $table->dropColumn(['unit_price', 'total_price']);
        });

        Schema::create('rfq_suppliers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('rfq_id')->constrained()->cascadeOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            // Snapshot fields, frozen at canvass time (same rationale as purchase_orders'
            // supplier snapshot) — independent of later edits to the Supplier record.
            $table->string('supplier_name')->nullable();
            $table->string('supplier_address')->nullable();
            $table->string('supplier_contact_no')->nullable();
            $table->string('supplier_tin')->nullable();
            $table->string('supplier_by')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('reply_due_at')->nullable();
            $table->string('status')->default('Sent'); // Sent | Replied | TimedOut | Replaced
            $table->foreignId('replaced_by_supplier_id')->nullable()->constrained('rfq_suppliers')->nullOnDelete();
            $table->boolean('is_winner')->default(false);
            $table->text('remarks')->nullable();
            $table->timestamps();
        });

        Schema::create('rfq_quote_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('rfq_supplier_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rfq_item_id')->constrained()->cascadeOnDelete();
            $table->decimal('unit_price', 14, 2)->nullable();
            $table->decimal('total_price', 14, 2)->nullable();
            $table->timestamps();
        });

        Schema::create('abstract_of_canvases', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('rfq_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('procurement_category');
            $table->text('twg_evaluation_notes')->nullable(); // required before generation when category = Equipment
            $table->foreignId('winning_rfq_supplier_id')->nullable()->constrained('rfq_suppliers')->nullOnDelete();
            $table->string('status')->default('Draft'); // Draft | Pending BAC Review | BAC Returned | Approved | Cancelled
            $table->text('bac_remarks')->nullable();
            $table->text('twg_response')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });

        Schema::table('purchase_orders', function (Blueprint $table): void {
            $table->foreignId('budget_officer_id')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            $table->string('budget_officer_name')->nullable()->after('budget_officer_id');
            $table->timestamp('budget_officer_signed_at')->nullable()->after('budget_officer_name');
            $table->foreignId('accounting_officer_id')->nullable()->after('budget_officer_signed_at')->constrained('users')->nullOnDelete();
            $table->string('accounting_officer_name')->nullable()->after('accounting_officer_id');
            $table->timestamp('accounting_officer_signed_at')->nullable()->after('accounting_officer_name');
            $table->foreignId('approved_by_id')->nullable()->after('accounting_officer_signed_at')->constrained('users')->nullOnDelete();
            $table->string('approved_by_name')->nullable()->after('approved_by_id');
            $table->timestamp('approved_by_signed_at')->nullable()->after('approved_by_name');
            $table->boolean('delivery_waived')->default(false)->after('terms_and_conditions');
            $table->timestamp('delivery_waived_at')->nullable()->after('delivery_waived');
            $table->text('delivery_waived_reason')->nullable()->after('delivery_waived_at');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('budget_officer_id');
            $table->dropColumn(['budget_officer_name', 'budget_officer_signed_at']);
            $table->dropConstrainedForeignId('accounting_officer_id');
            $table->dropColumn(['accounting_officer_name', 'accounting_officer_signed_at']);
            $table->dropConstrainedForeignId('approved_by_id');
            $table->dropColumn(['approved_by_name', 'approved_by_signed_at', 'delivery_waived', 'delivery_waived_at', 'delivery_waived_reason']);
        });

        Schema::dropIfExists('abstract_of_canvases');
        Schema::dropIfExists('rfq_quote_items');
        Schema::dropIfExists('rfq_suppliers');

        Schema::table('rfq_items', function (Blueprint $table): void {
            $table->decimal('unit_price', 14, 2)->nullable();
            $table->decimal('total_price', 14, 2)->nullable();
        });

        Schema::table('rfqs', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('bac_chair_signed_by');
            $table->dropColumn(['bac_chair_signed_name', 'bac_chair_signed_at']);
            $table->dropConstrainedForeignId('bac_vice_chair_signed_by');
            $table->dropColumn(['bac_vice_chair_signed_name', 'bac_vice_chair_signed_at']);
            $table->dropConstrainedForeignId('supply_officer_signed_by');
            $table->dropColumn(['supply_officer_signed_name', 'supply_officer_signed_at', 'procurement_category']);
            $table->string('supplier_name')->nullable();
            $table->string('supplier_address')->nullable();
            $table->string('supplier_by')->nullable();
            $table->string('supplier_contact_no')->nullable();
            $table->string('supplier_tin')->nullable();
        });

        Schema::dropIfExists('suppliers');
    }
};
