<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_cse_items', function (Blueprint $table): void {
            $table->unsignedSmallInteger('fiscal_year')->nullable()->after('project_id');
            // Rows rolled up automatically from approved PPMPs, vs. manually encoded reference rows.
            $table->boolean('is_consolidated')->default(false)->after('fiscal_year');
        });

        Schema::table('app_non_cse_items', function (Blueprint $table): void {
            $table->unsignedSmallInteger('fiscal_year')->nullable()->after('project_id');
            $table->boolean('is_consolidated')->default(false)->after('fiscal_year');
        });
    }

    public function down(): void
    {
        Schema::table('app_cse_items', function (Blueprint $table): void {
            $table->dropColumn(['fiscal_year', 'is_consolidated']);
        });

        Schema::table('app_non_cse_items', function (Blueprint $table): void {
            $table->dropColumn(['fiscal_year', 'is_consolidated']);
        });
    }
};
