<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Staff cashiers should not see venue-wide sales reports by default.
 * Owner/manager keep reports.view; grant per-user via Admin → Roles & Permissions.
 */
return new class extends Migration
{
    public function up(): void
    {
        $staffRoleId = DB::table('roles')->where('slug', 'staff')->value('id');
        if (!$staffRoleId) {
            return;
        }

        $permissionIds = DB::table('permissions')
            ->whereIn('slug', ['reports.view', 'reports.basic', 'reports.sales'])
            ->pluck('id');

        if ($permissionIds->isEmpty()) {
            return;
        }

        DB::table('role_permission')
            ->where('role_id', $staffRoleId)
            ->whereIn('permission_id', $permissionIds)
            ->delete();
    }

    public function down(): void
    {
        $staffRoleId = DB::table('roles')->where('slug', 'staff')->value('id');
        if (!$staffRoleId) {
            return;
        }

        foreach (['reports.view', 'reports.basic'] as $slug) {
            $permissionId = DB::table('permissions')->where('slug', $slug)->value('id');
            if (!$permissionId) {
                continue;
            }
            $exists = DB::table('role_permission')
                ->where('role_id', $staffRoleId)
                ->where('permission_id', $permissionId)
                ->exists();
            if (!$exists) {
                DB::table('role_permission')->insert([
                    'role_id' => $staffRoleId,
                    'permission_id' => $permissionId,
                ]);
            }
        }
    }
};
