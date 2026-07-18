<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Owner-only: issue / manage physical-style discount cards.
 * Managers and staff do not get this by default (excluded in PermissionCatalog).
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('permissions')->updateOrInsert(
            ['slug' => 'promotions.discount_cards'],
            [
                'name' => 'Issue discount cards',
                'group' => 'Promotions',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        $permissionId = (int) DB::table('permissions')
            ->where('slug', 'promotions.discount_cards')
            ->value('id');

        if ($permissionId === 0) {
            return;
        }

        $ownerId = (int) DB::table('roles')->where('slug', 'owner')->value('id');
        if ($ownerId > 0) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $ownerId, 'permission_id' => $permissionId],
                [],
            );
        }
    }

    public function down(): void
    {
        $permissionId = (int) DB::table('permissions')
            ->where('slug', 'promotions.discount_cards')
            ->value('id');

        if ($permissionId === 0) {
            return;
        }

        DB::table('role_permission')->where('permission_id', $permissionId)->delete();
        DB::table('user_permission')->where('permission_id', $permissionId)->delete();
        DB::table('permissions')->where('id', $permissionId)->delete();
    }
};
