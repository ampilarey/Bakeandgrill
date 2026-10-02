<?php

declare(strict_types=1);

namespace Tests\Feature\Permissions;

use App\Domains\Permissions\PermissionCatalog;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Permissions\RolePermissionCustomisations;
use App\Domains\Permissions\Services\PermissionService;
use App\Models\AuditLog;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Permissions audit, 2026-10-02: "I have given void permission to cashiers
 * many times, but after an update they don't see it." The deploy-time sync
 * reset every stock role to the catalog. The owner's changes are now kept
 * apart and reapplied on top.
 */
class RolePermissionCustomisationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->assertNotContains('orders.void', PermissionCatalog::staffSlugs(), 'the premise: void is not a Staff default');
    }

    /** @return array<string, bool> */
    private function staffMap(array $changes): array
    {
        $map = [];
        foreach (app(PermissionService::class)->rolePermissions('staff') as $p) {
            $map[$p['slug']] = $p['granted'];
        }

        return array_merge($map, $changes);
    }

    private function staffHas(string $slug): bool
    {
        return Role::where('slug', 'staff')->firstOrFail()->permissions()->where('slug', $slug)->exists();
    }

    public function test_a_void_grant_on_the_staff_role_survives_the_deploy_sync(): void
    {
        $owner = $this->makeOwner();
        Sanctum::actingAs($owner, ['staff']);
        $this->putJson('/api/roles/staff/permissions', ['permissions' => ['orders.void' => true]])->assertOk();
        $this->assertTrue($this->staffHas('orders.void'));

        $row = DB::table(RolePermissionCustomisations::TABLE)->where('role_slug', 'staff')->where('permission_slug', 'orders.void')->first();
        $this->assertNotNull($row);
        $this->assertSame(1, (int) $row->granted);
        $this->assertSame($owner->id, (int) $row->set_by);

        // What every deploy and twenty migrations do.
        PermissionCatalogSync::sync();
        $this->assertTrue($this->staffHas('orders.void'), 'the sync used to delete this');

        Artisan::call('permissions:sync', ['--dry-run' => true]);
        $out = Artisan::output();
        $this->assertStringContainsString('Nothing to do', $out);
        $this->assertStringContainsString('1 owner customisation(s)', $out);

        $staff = $this->makeStaff('staff');
        $this->assertTrue(app(PermissionService::class)->hasPermission($staff, 'orders.void'));

        $void = collect($this->getJson('/api/roles/staff/permissions')->assertOk()->json('permissions'))->firstWhere('slug', 'orders.void');
        $this->assertTrue($void['customised']);
        $this->assertFalse($void['role_default']);
    }

    public function test_switching_off_a_default_stays_off_and_reverting_forgets_the_customisation(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->assertContains('orders.refund_request', PermissionCatalog::staffSlugs());

        $this->putJson('/api/roles/staff/permissions', ['permissions' => ['orders.refund_request' => false]])->assertOk();
        PermissionCatalogSync::sync();
        $this->assertFalse($this->staffHas('orders.refund_request'));

        $this->putJson('/api/roles/staff/permissions', ['permissions' => ['orders.refund_request' => true]])->assertOk();
        $this->assertSame(0, DB::table(RolePermissionCustomisations::TABLE)->where('role_slug', 'staff')->count());
        PermissionCatalogSync::sync();
        $this->assertTrue($this->staffHas('orders.refund_request'));
    }

    public function test_the_owners_past_decisions_are_recovered_from_the_audit_log(): void
    {
        $owner = $this->makeOwner();
        $before = $this->staffMap([]);
        $rows = fn (array $map) => collect($map)->map(fn ($g, $s) => ['slug' => $s, 'granted' => $g, 'name' => $s, 'group' => 'x'])->values()->all();

        // Save 1: void on. Save 2: refund requests off. Save 3 (manager): a
        // default switched off. The sync then wiped all three, as it did.
        $after1 = $this->staffMap(['orders.void' => true]);
        AuditLog::create(['user_id' => $owner->id, 'action' => 'role.permissions.updated', 'model_type' => 'Role', 'old_values' => ['role' => 'staff', 'permissions' => $rows($before)], 'new_values' => ['role' => 'staff', 'permissions' => $rows($after1)]]);
        $after2 = array_merge($after1, ['orders.refund_request' => false]);
        AuditLog::create(['user_id' => $owner->id, 'action' => 'role.permissions.updated', 'model_type' => 'Role', 'old_values' => ['role' => 'staff', 'permissions' => $rows($after1)], 'new_values' => ['role' => 'staff', 'permissions' => $rows($after2)]]);
        // Save 4: the owner changed their mind about refund requests.
        $after3 = array_merge($after2, ['orders.refund_request' => true]);
        AuditLog::create(['user_id' => $owner->id, 'action' => 'role.permissions.updated', 'model_type' => 'Role', 'old_values' => ['role' => 'staff', 'permissions' => $rows($after2)], 'new_values' => ['role' => 'staff', 'permissions' => $rows($after3)]]);
        $this->assertFalse($this->staffHas('orders.void'));

        $replayed = RolePermissionCustomisations::rebuildFromAuditLog();
        $this->assertSame(3, $replayed);
        $this->assertSame(['orders.void' => true], RolePermissionCustomisations::for('staff'));

        PermissionCatalogSync::sync();
        $this->assertTrue($this->staffHas('orders.void'));
        $this->assertTrue($this->staffHas('orders.refund_request'));
    }

    public function test_the_owner_role_is_never_customised(): void
    {
        RolePermissionCustomisations::recordFrom('owner', ['orders.void' => false]);
        $this->assertSame(0, DB::table(RolePermissionCustomisations::TABLE)->count());
        $this->assertContains('orders.void', RolePermissionCustomisations::expectedSlugs('owner'));
    }
}
