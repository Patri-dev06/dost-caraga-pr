<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ppmp_documents', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('ppmp_no')->nullable();
            $table->unsignedSmallInteger('fiscal_year');
            $table->string('end_user_unit')->nullable();
            $table->string('document_type')->default('Final');
            $table->string('source_filename')->nullable();
            $table->decimal('total_estimated_budget', 14, 2)->default(0);
            $table->unsignedInteger('row_count')->default(0);
            $table->foreignId('imported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('imported_at')->nullable();
            $table->timestamps();

            $table->index(['project_id', 'fiscal_year']);
        });

        Schema::table('ppmp_items', function (Blueprint $table): void {
            $table->foreignId('ppmp_document_id')->nullable()->after('id')->constrained('ppmp_documents')->cascadeOnDelete();
            $table->unsignedInteger('row_number')->nullable()->after('ppmp_document_id');
            $table->string('expense_category')->nullable()->after('code');
            $table->text('general_description')->nullable()->after('expense_category');
            $table->string('project_type')->nullable()->after('general_description');
            $table->text('quantity_size')->nullable()->after('project_type');
            $table->string('recommended_mode')->nullable()->after('quantity_size');
            $table->string('pre_procurement_conference')->nullable()->after('recommended_mode');
            $table->string('procurement_start')->nullable()->after('pre_procurement_conference');
            $table->string('procurement_end')->nullable()->after('procurement_start');
            $table->string('delivery_period')->nullable()->after('procurement_end');
            $table->text('source_of_funds')->nullable()->after('delivery_period');
            $table->decimal('estimated_budget', 14, 2)->nullable()->after('source_of_funds');
            $table->text('supporting_documents')->nullable()->after('estimated_budget');
            $table->text('remarks')->nullable()->after('supporting_documents');
        });
    }

    public function down(): void
    {
        Schema::table('ppmp_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('ppmp_document_id');
            $table->dropColumn([
                'row_number',
                'expense_category',
                'general_description',
                'project_type',
                'quantity_size',
                'recommended_mode',
                'pre_procurement_conference',
                'procurement_start',
                'procurement_end',
                'delivery_period',
                'source_of_funds',
                'estimated_budget',
                'supporting_documents',
                'remarks',
            ]);
        });

        Schema::dropIfExists('ppmp_documents');
    }
};
