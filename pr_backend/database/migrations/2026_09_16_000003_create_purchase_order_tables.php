<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_orders', function (Blueprint $table): void {
            $table->id();
            $table->string('po_no')->unique();
            $table->foreignId('purchase_request_id')->constrained()->restrictOnDelete();
            $table->foreignId('rfq_id')->constrained()->restrictOnDelete();
            // Supplier fields are copied from the winning RFQ at generation time —
            // a frozen snapshot, independent of later edits to the RFQ record.
            $table->string('supplier_name')->nullable();
            $table->string('supplier_address')->nullable();
            $table->string('supplier_contact_no')->nullable();
            $table->string('supplier_tin')->nullable();
            $table->string('po_date')->nullable();
            $table->string('delivery_date')->nullable();
            $table->string('place_of_delivery')->nullable();
            $table->string('mode_of_procurement')->nullable();
            $table->decimal('total_amount', 14, 2)->default(0);
            $table->text('terms_and_conditions')->nullable();
            $table->string('status')->default('Draft');
            $table->string('stage')->default('Draft');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('purchase_order_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rfq_item_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('item_no')->default(0);
            $table->text('description')->nullable();
            $table->string('uom', 30)->nullable();
            $table->decimal('quantity', 12, 2)->default(0);
            $table->decimal('unit_cost', 14, 2)->default(0);
            $table->decimal('total_cost', 14, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_order_items');
        Schema::dropIfExists('purchase_orders');
    }
};
