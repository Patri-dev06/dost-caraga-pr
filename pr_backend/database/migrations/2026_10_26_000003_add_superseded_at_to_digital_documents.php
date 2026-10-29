<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A PR returned for revision changes, so its signed PDF is set aside (kept as a record) and the
        // resubmission starts a new one: one current document per PR, any number superseded.
        Schema::table('digital_documents', function (Blueprint $table): void {
            $table->timestamp('superseded_at')->nullable();
            $table->dropUnique(['documentable_type', 'documentable_id', 'kind']);
            $table->index(['documentable_type', 'documentable_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::table('digital_documents', function (Blueprint $table): void {
            $table->dropIndex(['documentable_type', 'documentable_id', 'kind']);
            $table->dropColumn('superseded_at');
            $table->unique(['documentable_type', 'documentable_id', 'kind']);
        });
    }
};
