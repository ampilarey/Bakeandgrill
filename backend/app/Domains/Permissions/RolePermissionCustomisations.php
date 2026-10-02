<?php

declare(strict_types=1);

namespace App\Domains\Permissions;

use App\Models\AuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The owner's changes to a stock role, kept apart from the catalog
 * (permissions audit, 2026-10-02).
 *
 * A role's permissions are rows; the catalog that says what each role gets
 * by default is code. The sync that reconciles the two ran on every deploy
 * and reset each role to exactly the catalog, so "Void orders", which the
 * owner had switched on for Staff in the admin, vanished with every update
 * and the cashiers lost the button. The owner's decisions now live here,
 * as the difference from the catalog, and the sync applies the catalog
 * first and these on top.
 */
final class RolePermissionCustomisations
{
    public const TABLE = 'role_permission_customisations';

    /** The roles an owner may edit; the owner role always holds everything. */
    public const ROLES = ['manager', 'staff', 'kitchen_staff'];

    /** @return array<string, bool> permission slug => granted */
    public static function for(string $roleSlug): array
    {
        if (!Schema::hasTable(self::TABLE)) {
            return [];
        }

        return DB::table(self::TABLE)
            ->where('role_slug', $roleSlug)
            ->pluck('granted', 'permission_slug')
            ->map(fn ($g) => (bool) $g)
            ->all();
    }

    /**
     * What the role should hold: the catalog, plus what the owner switched
     * on, minus what the owner switched off.
     *
     * @return list<string>
     */
    public static function expectedSlugs(string $roleSlug): array
    {
        $slugs = array_fill_keys(PermissionCatalog::slugsForRole($roleSlug), true);
        if ($roleSlug === 'owner') {
            return array_keys($slugs);
        }
        foreach (self::for($roleSlug) as $slug => $granted) {
            if ($granted) {
                $slugs[$slug] = true;
            } else {
                unset($slugs[$slug]);
            }
        }

        return array_keys($slugs);
    }

    /**
     * Record how a saved set differs from the catalog. A slug set back to
     * its catalog default stops being a customisation.
     *
     * @param array<string, bool> $permissions slug => granted, for the slugs decided
     */
    public static function recordFrom(string $roleSlug, array $permissions, ?int $setBy = null): void
    {
        if (!Schema::hasTable(self::TABLE) || !in_array($roleSlug, self::ROLES, true)) {
            return;
        }
        $catalog = array_fill_keys(PermissionCatalog::slugsForRole($roleSlug), true);
        $now = now();

        foreach ($permissions as $slug => $granted) {
            $granted = (bool) $granted;
            if ($granted === isset($catalog[$slug])) {
                DB::table(self::TABLE)->where('role_slug', $roleSlug)->where('permission_slug', $slug)->delete();

                continue;
            }
            DB::table(self::TABLE)->updateOrInsert(
                ['role_slug' => $roleSlug, 'permission_slug' => $slug],
                ['granted' => $granted, 'set_by' => $setBy, 'updated_at' => $now, 'created_at' => $now],
            );
        }
    }

    /**
     * Recover the owner's decisions from the audit log, which kept the full
     * before-and-after set of every role save. Each save is replayed in
     * order and only the slugs it actually changed are taken from it, so a
     * permission the owner never touched follows the catalog.
     *
     * @return int the number of decisions replayed
     */
    public static function rebuildFromAuditLog(): int
    {
        if (!Schema::hasTable(self::TABLE) || !Schema::hasTable('audit_logs')) {
            return 0;
        }
        $count = 0;
        AuditLog::query()
            ->where('action', 'role.permissions.updated')
            ->orderBy('id')
            ->chunk(100, function ($logs) use (&$count): void {
                foreach ($logs as $log) {
                    $new = is_array($log->new_values) ? $log->new_values : [];
                    $old = is_array($log->old_values) ? $log->old_values : [];
                    $role = $new['role'] ?? null;
                    if (!is_string($role) || !in_array($role, self::ROLES, true)) {
                        continue;
                    }
                    $after = self::grantedMap($new['permissions'] ?? []);
                    $before = self::grantedMap($old['permissions'] ?? []);
                    $changed = [];
                    foreach ($after as $slug => $granted) {
                        if ($granted !== ($before[$slug] ?? false)) {
                            $changed[$slug] = $granted;
                        }
                    }
                    if ($changed === []) {
                        continue;
                    }
                    self::recordFrom($role, $changed, $log->user_id === null ? null : (int) $log->user_id);
                    $count += count($changed);
                }
            });

        return $count;
    }

    /**
     * @param mixed $rows the audited list of {slug, granted} rows
     * @return array<string, bool>
     */
    private static function grantedMap(mixed $rows): array
    {
        $map = [];
        if (!is_array($rows)) {
            return $map;
        }
        foreach ($rows as $row) {
            if (is_array($row) && isset($row['slug'])) {
                $map[(string) $row['slug']] = (bool) ($row['granted'] ?? false);
            }
        }

        return $map;
    }
}
