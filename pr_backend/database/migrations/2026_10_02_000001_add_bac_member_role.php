<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /** BAC members (besides the Chairman and Vice-Chairman) sign the printed Abstract of Canvas. */
    public function up(): void
    {
        if (! DB::table('roles')->where('name', 'BAC Member')->exists()) {
            DB::table('roles')->insert([
                'name' => 'BAC Member',
                'description' => 'Member of the Bids and Awards Committee; signs the Abstract of Canvas.',
                'permissions' => json_encode(['Sign AOC']),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        $id = DB::table('roles')->where('name', 'BAC Member')->value('id');
        DB::table('role_user')->where('role_id', $id)->delete();
        DB::table('roles')->where('id', $id)->delete();
    }
};
