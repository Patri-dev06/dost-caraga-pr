<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** The single designated Supervisor is gone: each LIB now goes to whoever is picked as its Recommending Approval. */
    public function up(): void
    {
        DB::table('system_preferences')->where('key', 'supervisor_user_id')->delete();
    }

    public function down(): void
    {
        // The setting was a pointer to one user; nothing meaningful to restore.
    }
};
