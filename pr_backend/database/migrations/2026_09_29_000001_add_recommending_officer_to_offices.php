<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('offices', function (Blueprint $table): void {
            // Who a Purchase Request from this office is routed to for recommendation, unless the
            // LGIA override applies. Set per office in Settings; null means no automatic routing yet.
            $table->foreignId('recommending_officer_id')->nullable()->after('description')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('offices', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('recommending_officer_id');
        });
    }
};
