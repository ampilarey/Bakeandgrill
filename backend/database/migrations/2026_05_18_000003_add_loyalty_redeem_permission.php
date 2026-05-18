<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Adds the `loyalty.redeem` permission so cashiers can redeem points on
 * behalf of a customer at the POS register, and grants it by default to
 * the Owner / Manager / Staff roles. Owner bypasses permission checks
 * anyway, but we still insert the pivot row for consistency with the
 * other "everyone-grant" permissions like `promotions.discounts`.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('permissions')->updateOrInsert(
            ['slug' => 'loyalty.redeem'],
            [
                'name' => 'Redeem Loyalty Points at POS',
                'group' => 'Loyalty',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        $permissionId = (int) DB::table('permissions')
            ->where('slug', 'loyalty.redeem')
            ->value('id');

        if ($permissionId === 0) {
            return;
        }

        $roleIds = DB::table('roles')
            ->whereIn('slug', ['owner', 'manager', 'staff'])
            ->pluck('id', 'slug');

        foreach ($roleIds as $roleId) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['created_at' => $now, 'updated_at' => $now],
            );
        }
    }

    public function down(): void
    {
        $permissionId = (int) DB::table('permissions')
            ->where('slug', 'loyalty.redeem')
            ->value('id');

        if ($permissionId === 0) {
            return;
        }

        DB::table('role_permission')->where('permission_id', $permissionId)->delete();
        DB::table('user_permission')->where('permission_id', $permissionId)->delete();
        DB::table('permissions')->where('id', $permissionId)->delete();
    }
};
