<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Permissions\PermissionCatalog;
use App\Models\Permission;
use App\Models\User;
use App\Services\PermissionService;
use Illuminate\Console\Command;

/**
 * Why one staff account can or cannot do one thing.
 *
 * Owner, 2026-09-11: "I created kitchen staff acc. But when he tries to logon
 * kds app it says no kds access for this account."
 *
 * That question took a long time to answer from the outside, because three
 * separate things have to line up and none of them is visible from the login
 * screen: whether the role grants the slug, whether a per-user override has
 * overruled the role, and whether some other slug stands in for it through
 * PermissionCatalog::SATISFIED_BY. This prints all three.
 *
 *   php artisan staff:explain cook@example.com kds.view
 *   php artisan staff:explain 7712345
 *
 * With no slug it answers the question that prompted it: can this account
 * open the kitchen display, and if not, what is missing.
 */
class ExplainStaffPermissionCommand extends Command
{
    protected $signature = 'staff:explain
        {who : Email, phone or user id}
        {slug? : Permission slug to explain (default: the ones the KDS app needs)}';

    protected $description = 'Explain why a staff account does or does not have a permission.';

    /** What the KDS app checks, in the order it checks it. */
    private const KDS_SLUGS = ['kds.view', 'kds.start_order', 'kds.mark_kitchen_done', 'kds.print_ticket'];

    public function handle(PermissionService $permissions): int
    {
        $user = $this->findUser((string) $this->argument('who'));
        if ($user === null) {
            $this->error('No staff account matches that email, phone or id. Try `php artisan staff:list`.');

            return self::FAILURE;
        }

        $user->loadMissing('role');

        $this->line("Account : {$user->name} (#{$user->id})");
        $this->line('Role    : ' . ($user->role?->slug ?? '— none —'));
        $this->line('Active  : ' . ($user->is_active ? 'yes' : 'no  ← cannot sign in at all'));
        $this->newLine();

        $slug = $this->argument('slug');
        $slugs = is_string($slug) && $slug !== '' ? [$slug] : self::KDS_SLUGS;

        foreach ($slugs as $one) {
            $this->explain($permissions, $user, (string) $one);
        }

        if ($slug === null) {
            $this->newLine();
            $canSignIn = collect(['pos.access', 'kds.view', 'admin.access'])
                ->contains(fn (string $s) => $permissions->hasPermission($user, $s));

            $this->line($canSignIn
                ? 'Sign-in on staff devices: allowed.'
                : 'Sign-in on staff devices: refused — needs pos.access, kds.view or admin.access.');

            if ($canSignIn && !$permissions->hasPermission($user, 'kds.view')) {
                $this->newLine();
                $this->warn('This is the "No KDS access for this account." case: the account can sign in');
                $this->warn('but the board will not let it in. Grant kds.view — in the admin under');
                $this->warn('Staff → the person → Permissions, or by putting them on the Kitchen Staff role.');
            }
        }

        return self::SUCCESS;
    }

    private function explain(PermissionService $permissions, User $user, string $slug): void
    {
        $granted = $permissions->hasPermission($user, $slug);
        $this->line(sprintf('%-28s %s', $slug, $granted ? 'GRANTED' : 'not granted'));

        if (Permission::where('slug', $slug)->doesntExist()) {
            $this->line('    └ no such permission in the database. Run `php artisan permissions:sync`.');

            return;
        }

        if ($permissions->isOwner($user)) {
            $this->line('    └ owner — every permission is granted regardless of the catalog.');

            return;
        }

        $override = $user->permissions()->where('slug', $slug)->first();
        if ($override !== null) {
            $mode = $override->pivot->granted ? 'allowed' : 'denied';
            $this->line("    └ per-user override: {$mode}. This beats the role either way.");

            return;
        }

        $fromRole = $user->role
            && $user->role->permissions()->where('slug', $slug)->exists();
        if ($fromRole) {
            $this->line('    └ from the ' . $user->role->slug . ' role.');

            return;
        }

        // Not held directly — say so, and name the stand-in if one let it through.
        $standIns = array_values(array_diff(PermissionCatalog::expandCheckSlugs($slug), [$slug]));
        foreach ($standIns as $other) {
            if ($permissions->hasPermission($user, $other)) {
                $this->line("    └ not held directly, but '{$other}' stands in for it (SATISFIED_BY).");

                return;
            }
        }

        $this->line('    └ not on the ' . ($user->role?->slug ?? 'account') . ' role'
            . ($standIns === [] ? '.' : ', and none of ' . implode(', ', $standIns) . ' either.'));
    }

    private function findUser(string $who): ?User
    {
        if (ctype_digit($who)) {
            $byId = User::find((int) $who);
            if ($byId !== null) {
                return $byId;
            }
        }

        return User::where('email', $who)->orWhere('phone', $who)->first();
    }
}
