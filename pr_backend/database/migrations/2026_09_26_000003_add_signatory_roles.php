<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Signatory roles, assigned per account in User Management (an account may hold several).
     * The RFQ's BAC Chairman picker lists holders of "BAC Chairman"; only one account may be the
     * Regional Director (enforced when roles are assigned).
     */
    private const ROLES = [
        ['name' => 'BAC Chairman', 'description' => 'Chairs the Bids and Awards Committee; signs RFQs and reviews Abstracts of Canvas.', 'permissions' => ['Sign RFQ', 'Review AOC']],
        ['name' => 'BAC Vice-Chairman', 'description' => 'Acts for the BAC Chairman on RFQs and Abstracts of Canvas.', 'permissions' => ['Sign RFQ', 'Review AOC']],
        ['name' => 'Regional Director', 'description' => 'Head of the regional office and final approving authority. Only one account holds this role.', 'permissions' => ['Approve PR', 'Approve LIB', 'Approve PO']],
    ];

    public function up(): void
    {
        foreach (self::ROLES as $role) {
            if (! DB::table('roles')->where('name', $role['name'])->exists()) {
                DB::table('roles')->insert([
                    'name' => $role['name'],
                    'description' => $role['description'],
                    'permissions' => json_encode($role['permissions']),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        $ids = DB::table('roles')->whereIn('name', array_column(self::ROLES, 'name'))->pluck('id');
        DB::table('role_user')->whereIn('role_id', $ids)->delete();
        DB::table('roles')->whereIn('id', $ids)->delete();
    }
};
