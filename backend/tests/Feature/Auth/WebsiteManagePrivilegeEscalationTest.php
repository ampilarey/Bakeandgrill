<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Domains\Permissions\PermissionCatalog;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\User;
use App\Services\PermissionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Closes the privilege-escalation hole where SATISFIED_BY let
 * website.manage satisfy roles_permissions.manage / settings.manage,
 * so a content editor could open Roles & Permissions and grant themselves
 * anything (including refund approval).
 */
class WebsiteManagePrivilegeEscalationTest extends TestCase
{
    use RefreshDatabase;

    private User $websiteEditor;

    private User $rolesManager;

    private User $settingsManager;

    private User $owner;

    private PermissionService $permissions;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();
        $this->permissions = app(PermissionService::class);

        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);

        $this->websiteEditor = User::create([
            'name' => 'Website Editor',
            'email' => 'website-editor@test.local',
            'phone' => '7700101',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->websiteEditor->grantPermission('website.manage');

        $this->rolesManager = User::create([
            'name' => 'Roles Manager',
            'email' => 'roles-manager@test.local',
            'phone' => '7700102',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->rolesManager->grantPermission('roles_permissions.manage');

        $this->settingsManager = User::create([
            'name' => 'Settings Manager',
            'email' => 'settings-manager@test.local',
            'phone' => '7700103',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->settingsManager->grantPermission('settings.manage');

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-esc@test.local',
            'phone' => '7700104',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    #[Test]
    public function website_manage_alone_cannot_reach_roles_permissions_admin_routes(): void
    {
        Sanctum::actingAs($this->websiteEditor, ['staff']);

        $this->getJson('/api/permissions')->assertForbidden();
        $this->getJson('/api/roles/staff/permissions')->assertForbidden();
        $this->putJson('/api/users/'.$this->websiteEditor->id.'/permissions', [
            'permissions' => ['orders.refund' => true],
        ])->assertForbidden();
    }

    #[Test]
    public function website_manage_alone_does_not_satisfy_settings_manage(): void
    {
        $this->assertFalse(
            $this->permissions->hasPermission($this->websiteEditor, 'settings.manage'),
        );
        $this->assertFalse(
            $this->permissions->hasPermission($this->websiteEditor, 'roles_permissions.manage'),
        );
        $this->assertTrue(
            $this->permissions->hasPermission($this->websiteEditor, 'website.manage'),
        );
    }

    #[Test]
    public function website_manage_still_reaches_content_admin_routes(): void
    {
        Sanctum::actingAs($this->websiteEditor, ['staff']);

        $this->getJson('/api/site-settings')->assertOk();
        $this->getJson('/api/admin/content')->assertOk();
        $this->getJson('/api/admin/page-blocks')->assertOk();
    }

    #[Test]
    public function explicit_roles_permissions_manage_still_reaches_admin_routes(): void
    {
        Sanctum::actingAs($this->rolesManager, ['staff']);

        $this->getJson('/api/permissions')->assertOk();
        $this->getJson('/api/roles/staff/permissions')->assertOk();
    }

    #[Test]
    public function settings_manage_still_satisfies_settings_update(): void
    {
        $this->assertTrue(
            $this->permissions->hasPermission($this->settingsManager, 'settings.update'),
        );
    }

    #[Test]
    public function owner_still_passes_every_check(): void
    {
        $this->assertTrue($this->permissions->hasPermission($this->owner, 'roles_permissions.manage'));
        $this->assertTrue($this->permissions->hasPermission($this->owner, 'settings.manage'));
        $this->assertTrue($this->permissions->hasPermission($this->owner, 'website.manage'));
        $this->assertTrue($this->permissions->hasPermission($this->owner, 'orders.refund'));

        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson('/api/permissions')->assertOk();
    }

    /**
     * Regression guard: roles_permissions.manage and settings.manage must
     * never again be satisfiable by any other slug via SATISFIED_BY. That
     * alias is what let a "Manage website" content editor open Roles &
     * Permissions and grant themselves refund approval (and everything else).
     * If you need a convenience alias, grant the real slug — do not reopen
     * this hole.
     */
    #[Test]
    public function satisfied_by_must_not_alias_roles_or_settings_manage_to_any_other_slug(): void
    {
        foreach (['roles_permissions.manage', 'settings.manage'] as $protected) {
            $aliases = PermissionCatalog::SATISFIED_BY[$protected] ?? [];
            $this->assertSame(
                [],
                $aliases,
                "SATISFIED_BY[{$protected}] must be empty (or unset) — no other slug may satisfy it.",
            );
        }
    }
}
