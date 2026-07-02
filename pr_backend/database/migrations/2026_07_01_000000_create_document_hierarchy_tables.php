<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lib_entries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('fund_source_id')->constrained()->restrictOnDelete();
            $table->unsignedSmallInteger('budget_year');
            $table->string('pap_code', 50)->nullable();
            $table->string('object_of_expenditure');
            $table->string('account_code', 50);
            $table->decimal('allocated_amount', 14, 2);
            $table->decimal('available_amount', 14, 2);
            $table->string('status', 30)->default('Draft');
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('parent_id')->nullable()->constrained('lib_entries')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->text('cancellation_reason')->nullable();
            $table->timestamps();

            $table->index(['project_id', 'budget_year']);
            $table->index('fund_source_id');
            $table->index('status');
        });

        Schema::create('approval_workflows', function (Blueprint $table): void {
            $table->id();
            $table->string('document_type', 50);
            $table->unsignedInteger('stage_order');
            $table->string('stage_name', 100);
            $table->string('required_role', 100);
            $table->text('description')->nullable();
            $table->boolean('is_final')->default(false);
            $table->timestamps();

            $table->unique(['document_type', 'stage_order']);
        });

        Schema::create('approval_steps', function (Blueprint $table): void {
            $table->id();
            $table->string('approvable_type', 100);
            $table->unsignedBigInteger('approvable_id');
            $table->foreignId('workflow_stage_id')->constrained('approval_workflows')->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('approver_name');
            $table->string('approver_designation')->nullable();
            $table->string('action', 30);
            $table->text('remarks')->nullable();
            $table->timestamp('acted_at');
            $table->timestamps();

            $table->index(['approvable_type', 'approvable_id']);
            $table->index('user_id');
        });

        Schema::table('ppmp_documents', function (Blueprint $table): void {
            $table->foreignId('fund_source_id')->nullable()->after('project_id')->constrained()->restrictOnDelete();
            $table->string('status', 30)->default('Draft')->after('document_type');
            $table->unsignedInteger('version')->default(1)->after('status');
            $table->foreignId('parent_id')->nullable()->after('version')->constrained('ppmp_documents')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('imported_at');
            $table->timestamp('cancelled_at')->nullable()->after('approved_at');
            $table->text('cancellation_reason')->nullable()->after('cancelled_at');
        });

        Schema::table('ppmp_items', function (Blueprint $table): void {
            $table->foreignId('lib_entry_id')->nullable()->after('ppmp_document_id')->constrained('lib_entries')->restrictOnDelete();
            $table->foreignId('fund_source_id')->nullable()->after('lib_entry_id')->constrained()->restrictOnDelete();
            $table->decimal('encumbered_amount', 14, 2)->default(0)->after('estimated_budget');
        });

        Schema::table('purchase_requests', function (Blueprint $table): void {
            $table->unsignedInteger('version')->default(1)->after('stage');
            $table->foreignId('parent_id')->nullable()->after('version')->constrained('purchase_requests')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('submitted_at');
            $table->timestamp('cancelled_at')->nullable()->after('approved_at');
            $table->text('cancellation_reason')->nullable()->after('cancelled_at');
        });

        Schema::table('purchase_request_items', function (Blueprint $table): void {
            $table->foreignId('ppmp_item_id')->nullable()->after('procurement_item_id')->constrained('ppmp_items')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('purchase_request_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('ppmp_item_id');
        });

        Schema::table('purchase_requests', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('parent_id');
            $table->dropColumn(['version', 'approved_at', 'cancelled_at', 'cancellation_reason']);
        });

        Schema::table('ppmp_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('lib_entry_id');
            $table->dropConstrainedForeignId('fund_source_id');
            $table->dropColumn('encumbered_amount');
        });

        Schema::table('ppmp_documents', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('fund_source_id');
            $table->dropConstrainedForeignId('parent_id');
            $table->dropColumn(['status', 'version', 'approved_at', 'cancelled_at', 'cancellation_reason']);
        });

        Schema::dropIfExists('approval_steps');
        Schema::dropIfExists('approval_workflows');
        Schema::dropIfExists('lib_entries');
    }
};
