<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lib_documents', function (Blueprint $table): void {
            // Structured project duration range; total_duration keeps the display string.
            $table->date('duration_from')->nullable()->after('total_duration');
            $table->date('duration_to')->nullable()->after('duration_from');
        });
    }

    public function down(): void
    {
        Schema::table('lib_documents', function (Blueprint $table): void {
            $table->dropColumn(['duration_from', 'duration_to']);
        });
    }
};
