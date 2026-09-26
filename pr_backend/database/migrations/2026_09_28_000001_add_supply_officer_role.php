<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** The Supply Officer designated in Settings must hold this role (like BAC Chairman and Regional Director). */
    public function up(): void
    {
        if (! DB::table('roles')->where('name', 'Supply Officer')->exists()) {
            DB::table('roles')->insert([
                'name' => 'Supply Officer',
                'description' => 'Counter-signs RFQs, notes the lowest bidder on an approved Abstract of Canvas, and rates venues.',
                'permissions' => json_encode(['Sign RFQ', 'Note lowest bidder', 'Rate venues']),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        $id = DB::table('roles')->where('name', 'Supply Officer')->value('id');
        DB::table('role_user')->where('role_id', $id)->delete();
        DB::table('roles')->where('id', $id)->delete();
    }
};
