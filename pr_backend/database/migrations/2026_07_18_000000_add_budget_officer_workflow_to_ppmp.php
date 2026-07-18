<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ppmp_documents', function (Blueprint $table): void {
            // The designated Budget Officer this PPMP is routed to for fund certification.
            $table->foreignId('budget_officer_id')->nullable()->after('owner_name')->constrained('users')->nullOnDelete();
            // Budget Officer's overall review note, and the reason captured when a PPMP is returned.
            $table->text('budget_officer_comment')->nullable()->after('budget_officer_id');
            $table->text('return_reason')->nullable()->after('budget_officer_comment');
            // Workflow timestamps.
            $table->timestamp('submitted_at')->nullable()->after('return_reason');
            $table->timestamp('reviewed_at')->nullable()->after('submitted_at');
            // Approval / sign-off (PNPKI to be wired in later — signature is a placeholder for now).
            $table->foreignId('approved_by_id')->nullable()->after('reviewed_at')->constrained('users')->nullOnDelete();
            $table->string('approved_by_name')->nullable()->after('approved_by_id');
            $table->timestamp('approved_at')->nullable()->after('approved_by_name');
            $table->string('approval_signature')->nullable()->after('approved_at');
        });

        Schema::table('ppmp_items', function (Blueprint $table): void {
            // Per-item note left by the Budget Officer during review.
            $table->text('reviewer_comment')->nullable()->after('remarks');
        });
    }

    public function down(): void
    {
        Schema::table('ppmp_items', function (Blueprint $table): void {
            $table->dropColumn('reviewer_comment');
        });

        Schema::table('ppmp_documents', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('budget_officer_id');
            $table->dropConstrainedForeignId('approved_by_id');
            $table->dropColumn([
                'budget_officer_comment',
                'return_reason',
                'submitted_at',
                'reviewed_at',
                'approved_by_name',
                'approved_at',
                'approval_signature',
            ]);
        });
    }
};
