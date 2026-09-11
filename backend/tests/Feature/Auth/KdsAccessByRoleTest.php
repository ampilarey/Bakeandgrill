<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Domains\Permissions\PermissionCatalog;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Which roles can open the kitchen display, and what a cook is told when they
 * cannot.
 *
 * Owner, 2026-09-11: "I created kitchen staff acc. But when he tries to logon
 * kds app it says no kds access for this account."
 *
 * The obvious guess is the wrong one, so it is written down here rather than
 * guessed at again. Both stock roles reach the board: `kitchen_staff` holds
 * `kds.view` outright, and `staff` passes the same check through
 * PermissionCatalog::SATISFIED_BY, which lets `orders.view` stand in for it.
 *
 * What produces the message is narrower. Sign-in and the board ask different
 * questions: StaffAuthController::canSignInToPos accepts pos.access, kds.view
 * *or* admin.access, while the app then insists on the literal string
 * "kds.view" in what /api/auth/me returns. An account with pos.access and
 * neither kds.view nor orders.view passes the first and fails the second —
 * which reads as a broken app rather than as a permission that is missing.
 *
 * From the four stock roles that state only arises from a per-user override,
 * or from a role whose stored permissions have drifted from the catalog.
 * `php artisan permissions:sync` is what repairs the second.
 */
class KdsAccessByRoleTest extends TestCase
{
    use RefreshDatabase;

    private function userWithRole(string $slug): User
    {
        PermissionCatalogSync::sync();
        $role = Role::where('slug', $slug)->firstOrFail();

        return User::factory()->create(['role_id' => $role->id, 'is_active' => true]);
    }

    public function test_a_kitchen_staff_account_may_open_the_kitchen_display(): void
    {
        $cook = $this->userWithRole('kitchen_staff');
        Sanctum::actingAs($cook, ['staff']);

        $this->getJson('/api/kds/orders')->assertOk();
    }

    public function test_the_kds_app_sees_the_permission_it_checks_for(): void
    {
        /*
         * The app decides with a plain `permissions.includes("kds.view")` on
         * whatever /staff/me returns — no implication rules, no aliases. So it
         * is not enough for the backend to consider the permission granted;
         * the exact slug has to appear in that list.
         */
        $cook = $this->userWithRole('kitchen_staff');
        Sanctum::actingAs($cook, ['staff']);

        $permissions = $this->getJson('/api/auth/me')->assertOk()->json('user.permissions');

        $this->assertIsArray($permissions);
        $this->assertContains('kds.view', $permissions);
    }

    public function test_a_cashier_can_open_the_kitchen_board_too(): void
    {
        /*
         * Not obvious, and worth writing down: a plain `staff` account reaches
         * the kitchen board as well. PermissionCatalog::SATISFIED_BY maps
         * 'kds.view' => ['orders.view'], so a kds.view check passes for anyone
         * holding orders.view, which every cashier does.
         *
         * So "no KDS access" is never explained by the account being on the
         * cashier role rather than the kitchen one. Both get in. An account
         * that is turned away holds neither kds.view nor orders.view, which
         * from the four stock roles can only come from a per-user override or
         * from a role whose stored permissions have drifted from the catalog.
         */
        $cashier = $this->userWithRole('staff');
        Sanctum::actingAs($cashier, ['staff']);

        $permissions = $this->getJson('/api/auth/me')->assertOk()->json('user.permissions');
        $this->assertContains('kds.view', $permissions);

        $this->getJson('/api/kds/orders')->assertOk();
    }

    public function test_an_account_with_neither_slug_is_the_one_that_is_turned_away(): void
    {
        /*
         * The reported symptom, reproduced: sign-in succeeds and then the board
         * refuses. It needs pos.access (so StaffAuthController::canSignInToPos
         * lets the login through) and neither kds.view nor orders.view (so the
         * app's own `permissions.includes("kds.view")` fails).
         */
        $user = $this->userWithRole('staff');
        $user->revokePermission('orders.view');
        $user->revokePermission('kds.view');
        Sanctum::actingAs($user, ['staff']);

        $permissions = $this->getJson('/api/auth/me')->assertOk()->json('user.permissions');
        $this->assertNotContains('kds.view', $permissions);
        $this->assertContains('pos.access', $permissions, 'Sign-in must still be possible, or the symptom is different.');

        $this->getJson('/api/kds/orders')->assertForbidden();
    }

    public function test_the_catalog_and_the_stored_role_agree(): void
    {
        /*
         * The catalog is code and the role's permissions are rows, and the only
         * thing that reconciles them is PermissionCatalogSync. A slug added to
         * kitchenStaffSlugs() without running the sync is granted in the source
         * and missing in the database — the account looks right in the admin
         * and is short a permission in the kitchen.
         */
        PermissionCatalogSync::sync();
        $stored = Role::where('slug', 'kitchen_staff')->firstOrFail()
            ->permissions()->pluck('slug')->sort()->values()->all();

        $expected = collect(PermissionCatalog::kitchenStaffSlugs())->unique()->sort()->values()->all();

        $this->assertSame(
            $expected,
            $stored,
            'The kitchen_staff role does not hold what the catalog says it should. '
            . 'Run `php artisan permissions:sync`.',
        );
    }
}
