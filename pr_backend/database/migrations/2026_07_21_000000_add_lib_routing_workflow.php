<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lib_documents', function (Blueprint $table): void {
            // Routing participants (resolved from the designated users at each stage).
            $table->foreignId('supervisor_id')->nullable()->after('owner_name')->constrained('users')->nullOnDelete();
            $table->foreignId('budget_officer_id')->nullable()->after('supervisor_id')->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by_id')->nullable()->after('budget_officer_id')->constrained('users')->nullOnDelete();

            // Stage timestamps.
            $table->timestamp('submitted_at')->nullable()->after('approved_by_id');
            $table->timestamp('recommended_at')->nullable()->after('submitted_at');
            $table->timestamp('certified_at')->nullable()->after('recommended_at');
            $table->timestamp('approved_at')->nullable()->after('certified_at');

            // Review metadata.
            $table->text('return_reason')->nullable()->after('approved_at');
            $table->text('review_comment')->nullable()->after('return_reason');
            $table->string('approval_signature')->nullable()->after('review_comment');
        });
    }

    public function down(): void
    {
        Schema::table('lib_documents', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('supervisor_id');
            $table->dropConstrainedForeignId('budget_officer_id');
            $table->dropConstrainedForeignId('approved_by_id');
            $table->dropColumn([
                'submitted_at', 'recommended_at', 'certified_at', 'approved_at',
                'return_reason', 'review_comment', 'approval_signature',
            ]);
        });
    }
};
