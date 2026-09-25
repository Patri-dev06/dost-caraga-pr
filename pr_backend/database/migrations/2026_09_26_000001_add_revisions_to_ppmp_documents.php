<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Revising an approved PPMP: the revision is its own document that goes back through
        // certification; the approved version stays in force until the revision replaces it.
        Schema::table('ppmp_documents', function (Blueprint $table): void {
            $table->foreignId('revision_of_id')->nullable()->after('revision_count')->constrained('ppmp_documents')->nullOnDelete();
            $table->text('revision_reason')->nullable()->after('revision_of_id');
            $table->timestamp('superseded_at')->nullable()->after('revision_reason');
            $table->foreignId('superseded_by_id')->nullable()->after('superseded_at')->constrained('ppmp_documents')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('ppmp_documents', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('superseded_by_id');
            $table->dropColumn('superseded_at');
            $table->dropColumn('revision_reason');
            $table->dropConstrainedForeignId('revision_of_id');
        });
    }
};
