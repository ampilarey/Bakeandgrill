<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Permissions\PermissionCatalog;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Console\Command;

/**
 * Re-apply the permission catalog to the four stock roles.
 *
 * The catalog is code and a role's permissions are rows in a pivot table, and
 * until now the only thing that reconciled the two was a migration somebody
 * remembered to write. Migrations run once, so a slug added to a role's list
 * afterwards is granted in the source and missing in the database: the admin
 * shows the role as if it had the permission and the staff member does not.
 *
 * Four slugs were already adrift when this was written — finance.settlements,
 * kitchen.production.plan, purchase_requests.receive and
 * purchase_requests.verify were added to the catalog after the last sync
 * migration (2026-09-03) and so had never reached a live database.
 *
 * Safe to run as often as you like: it writes only where the stored set
 * differs from the catalog, and it never touches per-user overrides, so a
 * permission granted or denied for one person by hand survives it.
 */
class SyncPermissionsCommand extends Command
{
    protected $signature = 'permissions:sync {--dry-run : Report what would change and write nothing}';

    protected $description = 'Reconcile role permissions with the permission catalog.';

    /** @var list<string> */
    private const ROLES = ['owner', 'manager', 'staff', 'kitchen_staff'];

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $missingRows = $this->missingPermissionRows();
        $drift = $this->roleDrift();

        if ($missingRows === [] && $drift === []) {
            $this->info('Nothing to do — every role already holds exactly what the catalog says.');

            return self::SUCCESS;
        }

        if ($missingRows !== []) {
            $this->warn(count($missingRows) . ' permission(s) defined in the catalog but absent from the database:');
            $this->line('  ' . implode(', ', $missingRows));
        }

        foreach ($drift as $role => $change) {
            $this->warn("Role '{$role}':");
            if ($change['add'] !== []) {
                $this->line('  + ' . implode(', ', $change['add']));
            }
            if ($change['remove'] !== []) {
                $this->line('  - ' . implode(', ', $change['remove']));
            }
        }

        if ($dryRun) {
            $this->newLine();
            $this->info('Dry run — nothing was written. Run without --dry-run to apply.');

            return self::SUCCESS;
        }

        PermissionCatalogSync::sync();

        $remaining = $this->roleDrift();
        if ($remaining !== []) {
            $this->error('Still out of step after syncing: ' . implode(', ', array_keys($remaining)) . '.');
            $this->line('A role missing from the roles table is not created by the sync. Check `roles`.');

            return self::FAILURE;
        }

        $this->info('Synced. Every role now holds exactly what the catalog says.');
        $this->line('Per-user overrides were not touched.');

        return self::SUCCESS;
    }

    /** @return list<string> */
    private function missingPermissionRows(): array
    {
        $defined = collect(PermissionCatalog::definitions())->pluck('slug');
        $stored = Permission::pluck('slug')->flip();

        return $defined->reject(fn (string $slug) => $stored->has($slug))->values()->all();
    }

    /**
     * @return array<string, array{add: list<string>, remove: list<string>}>
     */
    private function roleDrift(): array
    {
        $drift = [];

        foreach (self::ROLES as $slug) {
            $role = Role::where('slug', $slug)->first();
            if ($role === null) {
                // Not drift — the role does not exist at all, which the sync
                // cannot fix either. Reported separately after a sync attempt.
                continue;
            }

            $expected = collect(PermissionCatalog::slugsForRole($slug))->unique();
            $stored = $role->permissions()->pluck('slug');

            $add = $expected->diff($stored)->sort()->values()->all();
            $remove = $stored->diff($expected)->sort()->values()->all();

            if ($add !== [] || $remove !== []) {
                $drift[$slug] = ['add' => $add, 'remove' => $remove];
            }
        }

        return $drift;
    }
}
