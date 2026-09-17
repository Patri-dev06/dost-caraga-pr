<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rfqs', function (Blueprint $table): void {
            $table->id();
            $table->string('rfq_no')->unique();
            $table->foreignId('purchase_request_id')->constrained()->cascadeOnDelete();
            $table->string('quotation_no')->nullable();
            // Free text, not a real date picker on the form (e.g. openingDate can read
            // "TBD"), so these stay plain strings rather than validated/cast dates.
            $table->string('rfq_date')->nullable();
            $table->string('opening_date')->nullable();
            $table->string('place_of_delivery')->nullable();
            $table->decimal('estimated_budget', 14, 2)->default(0);
            $table->string('bac_chairman')->nullable();
            $table->string('bac_chairman_title')->nullable();
            $table->text('purpose')->nullable();
            // Free-text label, not FK'd — the RFQ form treats "fund source" as a
            // display string carried over from the PR, editable independently.
            $table->string('fund_source_snapshot')->nullable();
            $table->string('supplier_name')->nullable();
            $table->string('supplier_address')->nullable();
            $table->string('supplier_by')->nullable();
            $table->string('supplier_contact_no')->nullable();
            $table->string('supplier_tin')->nullable();
            $table->string('canvasser')->nullable();
            $table->string('bac_action')->nullable();
            $table->string('status')->default('Draft');
            $table->string('stage')->default('Draft');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('rfq_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('rfq_id')->constrained()->cascadeOnDelete();
            $table->foreignId('purchase_request_item_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('item_no')->default(0);
            $table->text('description')->nullable();
            $table->string('uom', 30)->nullable();
            $table->decimal('quantity', 12, 2)->default(0);
            $table->decimal('unit_abc', 14, 2)->default(0);
            $table->decimal('total_abc', 14, 2)->default(0);
            $table->decimal('unit_price', 14, 2)->nullable();
            $table->decimal('total_price', 14, 2)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rfq_items');
        Schema::dropIfExists('rfqs');
    }
};
