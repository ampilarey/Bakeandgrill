<?php

declare(strict_types=1);

namespace Tests\Feature\Console;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The two commands that answer "why can't this person use the kitchen board?"
 * and repair the usual cause.
 */
class PermissionToolsTest extends TestCase
{
    use RefreshDatabase;

    private function kitchenRole(): Role
    {
        PermissionCatalogSync::sync();

        return Role::where('slug', 'kitchen_staff')->firstOrFail();
    }

    public function test_sync_says_so_when_there_is_nothing_to_do(): void
    {
        $this->kitchenRole();

        $this->artisan('permissions:sync')
            ->expectsOutputToContain('Nothing to do')
            ->assertExitCode(0);
    }

    public function test_sync_restores_a_permission_dropped_from_a_role(): void
    {
        // The drift this exists for: the catalog grants it, the database does not.
        $role = $this->kitchenRole();
        $kdsView = Permission::where('slug', 'kds.view')->firstOrFail();
        $role->permissions()->detach($kdsView->id);

        $this->artisan('permissions:sync')
            ->expectsOutputToContain('kds.view')
            ->expectsOutputToContain('Synced.')
            ->assertExitCode(0);

        $this->assertTrue($role->fresh()->permissions()->where('slug', 'kds.view')->exists());
    }

    public function test_a_dry_run_reports_the_drift_and_writes_nothing(): void
    {
        $role = $this->kitchenRole();
        $role->permissions()->detach(Permission::where('slug', 'kds.view')->firstOrFail()->id);

        $this->artisan('permissions:sync --dry-run')
            ->expectsOutputToContain('kds.view')
            ->expectsOutputToContain('nothing was written')
            ->assertExitCode(0);

        $this->assertFalse($role->fresh()->permissions()->where('slug', 'kds.view')->exists());
    }

    public function test_sync_leaves_a_per_user_override_alone(): void
    {
        /*
         * A cashier trusted with one extra thing must not lose it because
         * somebody repaired a role.
         */
        $role = $this->kitchenRole();
        $cook = User::factory()->create(['role_id' => $role->id]);
        $cook->grantPermission('reports.view');

        $this->artisan('permissions:sync')->assertExitCode(0);

        $this->assertTrue($cook->fresh()->hasPermission('reports.view'));
    }

    public function test_explain_names_the_role_a_permission_comes_from(): void
    {
        $cook = User::factory()->create(['role_id' => $this->kitchenRole()->id, 'is_active' => true]);

        $this->artisan("staff:explain {$cook->email} kds.view")
            ->expectsOutputToContain('GRANTED')
            ->expectsOutputToContain('kitchen_staff')
            ->assertExitCode(0);
    }

    public function test_explain_names_the_stand_in_that_let_a_cashier_through(): void
    {
        /*
         * The confusing case. A cashier has no kds.view of their own, and the
         * board lets them in anyway because SATISFIED_BY accepts orders.view.
         * Saying which slug did it is the whole point of the command.
         */
        PermissionCatalogSync::sync();
        $cashier = User::factory()->create([
            'role_id' => Role::where('slug', 'staff')->firstOrFail()->id,
            'is_active' => true,
        ]);

        $this->artisan("staff:explain {$cashier->email} kds.view")
            ->expectsOutputToContain("'orders.view' stands in for it")
            ->assertExitCode(0);
    }

    public function test_explain_spells_out_the_reported_symptom(): void
    {
        // Signs in, then the board refuses: pos.access yes, kds.view no.
        PermissionCatalogSync::sync();
        $user = User::factory()->create([
            'role_id' => Role::where('slug', 'staff')->firstOrFail()->id,
            'is_active' => true,
        ]);
        $user->revokePermission('orders.view');
        $user->revokePermission('kds.view');

        $this->artisan("staff:explain {$user->email}")
            ->expectsOutputToContain('Sign-in on staff devices: allowed.')
            ->expectsOutputToContain('No KDS access for this account.')
            ->assertExitCode(0);
    }

    public function test_explain_says_when_the_account_does_not_exist(): void
    {
        $this->artisan('staff:explain nobody@example.com')
            ->expectsOutputToContain('No staff account matches')
            ->assertExitCode(1);
    }
}
