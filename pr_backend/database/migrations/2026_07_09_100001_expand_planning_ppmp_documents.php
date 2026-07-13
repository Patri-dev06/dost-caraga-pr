<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ppmp_documents', function (Blueprint $table): void {
            $table->string('client_uid')->nullable()->unique()->after('id');
            $table->foreignId('lib_document_id')->nullable()->after('project_id')->constrained()->nullOnDelete();
            $table->string('status')->default('Draft')->after('ppmp_no');
            $table->unsignedInteger('revision_count')->default(0)->after('status');
            $table->json('form_rows')->nullable()->after('row_count');
            $table->foreignId('owner_id')->nullable()->after('imported_by')->constrained('users')->nullOnDelete();
            $table->string('owner_name')->nullable()->after('owner_id');

            $table->index(['lib_document_id', 'status']);
            $table->index('owner_id');
        });

        Schema::table('ppmp_items', function (Blueprint $table): void {
            $table->string('client_uid')->nullable()->after('id');
            $table->string('expense_subcategory')->nullable()->after('expense_category');
            $table->string('item_name')->nullable()->after('project_type');

            $table->index(['ppmp_document_id', 'client_uid']);
        });
    }

    public function down(): void
    {
        Schema::table('ppmp_items', function (Blueprint $table): void {
            $table->dropIndex(['ppmp_document_id', 'client_uid']);
            $table->dropColumn(['client_uid', 'expense_subcategory', 'item_name']);
        });

        Schema::table('ppmp_documents', function (Blueprint $table): void {
            $table->dropIndex(['lib_document_id', 'status']);
            $table->dropIndex(['owner_id']);
            $table->dropConstrainedForeignId('lib_document_id');
            $table->dropConstrainedForeignId('owner_id');
            $table->dropColumn([
                'client_uid',
                'status',
                'revision_count',
                'form_rows',
                'owner_name',
            ]);
        });
    }
};
