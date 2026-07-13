<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // Access tier: superadmin | admin | regular. Drives coarse module access.
            $table->string('tier')->default('regular')->after('status');
            // Per-user module overrides for regular accounts (null = tier defaults).
            $table->json('modules')->nullable()->after('tier');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['tier', 'modules']);
        });
    }
};
