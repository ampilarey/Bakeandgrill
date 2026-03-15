<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Ensure owner role exists
        $ownerId = DB::table('roles')->where('slug', 'owner')->value('id');

        // 2. Reassign all users with 'admin' role → 'owner'
        if ($ownerId) {
            $adminId = DB::table('roles')->where('slug', 'admin')->value('id');
            if ($adminId) {
                DB::table('users')->where('role_id', $adminId)->update(['role_id' => $ownerId]);
            }
        }

        // 3. Ensure 'staff' role exists (upsert from cashier or create fresh)
        $cashierId = DB::table('roles')->where('slug', 'cashier')->value('id');
        $staffId   = DB::table('roles')->where('slug', 'staff')->value('id');

        if ($cashierId && !$staffId) {
            // Rename cashier row to staff
            DB::table('roles')->where('id', $cashierId)->update([
                'slug'        => 'staff',
                'name'        => 'Staff',
                'description' => 'Front-line staff member with limited access',
                'updated_at'  => now(),
            ]);
            $staffId = $cashierId;
        } elseif (!$staffId) {
            // Create staff from scratch
            $staffId = DB::table('roles')->insertGetId([
                'slug'        => 'staff',
                'name'        => 'Staff',
                'description' => 'Front-line staff member with limited access',
                'is_active'   => true,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
        } else {
            // Staff already exists; just reassign cashier users to it
            if ($cashierId) {
                DB::table('users')->where('role_id', $cashierId)->update(['role_id' => $staffId]);
            }
        }

        // 4. Delete legacy roles
        DB::table('roles')->whereIn('slug', ['admin', 'cashier'])->delete();
    }

    public function down(): void
    {
        // Recreate admin and cashier roles for rollback
        $adminId = DB::table('roles')->insertGetId([
            'slug'        => 'admin',
            'name'        => 'Admin',
            'description' => 'Administrator',
            'is_active'   => true,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        DB::table('roles')->insertGetId([
            'slug'        => 'cashier',
            'name'        => 'Cashier',
            'description' => 'Cashier',
            'is_active'   => true,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        // Note: we cannot deterministically reverse user reassignments,
        // but we restore the role rows themselves.
        unset($adminId);
    }
};
