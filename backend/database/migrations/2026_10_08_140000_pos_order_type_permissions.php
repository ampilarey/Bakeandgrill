<?php

declare(strict_types=1);

use App\Domains\Permissions\PermissionCatalog;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Permissions\RolePermissionCustomisations;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One permission per POS order type (owner, 2026-10-07: "pick up and
 * delivery turns off for staffs and on for a specific staff only. I need
 * full control").
 *
 * Nobody loses a type on deploy: the four stock roles get all four from the
 * catalog (the sync below), and here every other role that can ring sales,
 * and every person given "Ring sales" on their own page, gets them too. The
 * owner then turns types off where wanted.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('permissions') || !Schema::hasTable('role_permission')) {
            return;
        }

        PermissionCatalogSync::sync();

        $typeIds = DB::table('permissions')->whereIn('slug', PermissionCatalog::ORDER_TYPE_SLUGS)->pluck('id')->all();
        $ringIds = DB::table('permissions')->whereIn('slug', ['pos.ring_sales', 'orders.create'])->pluck('id')->all();
        if ($typeIds === [] || $ringIds === []) {
            return;
        }

        // Custom roles that can ring sales.
        $roleIds = DB::table('role_permission')->whereIn('permission_id', $ringIds)->distinct()->pluck('role_id');
        foreach ($roleIds as $roleId) {
            foreach ($typeIds as $pid) {
                DB::table('role_permission')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $pid]);
            }
        }

        // A stock role the owner had given "Ring sales" (kitchen staff, say)
        // keeps the types through every later sync: record them as the
        // owner's own change. For manager and staff they are the default.
        foreach (RolePermissionCustomisations::ROLES as $slug) {
            $roleId = DB::table('roles')->where('slug', $slug)->value('id');
            if ($roleId !== null && $roleIds->contains($roleId)) {
                RolePermissionCustomisations::recordFrom($slug, array_fill_keys(PermissionCatalog::ORDER_TYPE_SLUGS, true));
            }
        }
        PermissionCatalogSync::sync();

        // People allowed "Ring sales" on their own page, whose role cannot.
        if (Schema::hasTable('user_permission')) {
            $userIds = DB::table('user_permission')->whereIn('permission_id', $ringIds)->where('granted', true)->distinct()->pluck('user_id');
            $now = now();
            foreach ($userIds as $userId) {
                foreach ($typeIds as $pid) {
                    $exists = DB::table('user_permission')->where('user_id', $userId)->where('permission_id', $pid)->exists();
                    if (!$exists) {
                        DB::table('user_permission')->insert(['user_id' => $userId, 'permission_id' => $pid, 'granted' => true, 'granted_by' => null, 'created_at' => $now, 'updated_at' => $now]);
                    }
                }
            }
        }
    }

    public function down(): void
    {
        // Left in place: removing them would stop everyone ringing sales.
    }
};
