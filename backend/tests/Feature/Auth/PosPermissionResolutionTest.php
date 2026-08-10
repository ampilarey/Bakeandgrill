<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Domains\Permissions\PermissionCatalog;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Device;
use App\Models\Order;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\PermissionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PosPermissionResolutionTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $manager;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $managerRole = Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);

        $this->owner = User::create([
            'name' => 'Owner User', 'email' => 'owner@test.com',
            'password' => Hash::make('password'), 'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->manager = User::create([
            'name' => 'Manager User', 'email' => 'manager@test.com', 'phone' => '7700002',
            'password' => Hash::make('password'), 'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->staff = User::create([
            'name' => 'Staff User', 'email' => 'staff@test.com', 'phone' => '7700003',
            'password' => Hash::make('password'), 'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        PermissionCatalogSync::sync();
    }

    private function permissions(): PermissionService
    {
        return app(PermissionService::class);
    }

    public function test_owner_bypasses_all_permissions(): void
    {
        $this->staff->revokePermission('orders.void');

        $this->assertTrue($this->permissions()->hasPermission($this->owner, 'orders.void'));
        $this->assertTrue($this->permissions()->hasPermission($this->owner, 'devices.approve'));
        $this->assertTrue($this->permissions()->hasPermission($this->owner, 'roles_permissions.manage'));
    }

    public function test_owner_cannot_be_blocked_by_user_override(): void
    {
        $this->owner->revokePermission('orders.void');

        $this->assertTrue($this->permissions()->hasPermission($this->owner, 'orders.void'));
    }

    public function test_manager_can_void_by_role_default(): void
    {
        $this->assertTrue($this->permissions()->hasPermission($this->manager, 'orders.void'));
    }

    public function test_staff_cannot_void_by_role_default(): void
    {
        $this->assertFalse($this->permissions()->hasPermission($this->staff, 'orders.void'));
    }

    public function test_manager_can_view_all_stations_by_default(): void
    {
        $this->assertTrue($this->permissions()->hasPermission($this->manager, 'pos.view_all_station_orders'));
    }

    public function test_staff_cannot_view_all_stations_by_default(): void
    {
        $this->assertFalse($this->permissions()->hasPermission($this->staff, 'pos.view_all_station_orders'));
    }

    public function test_manager_can_view_all_shift_history_by_default(): void
    {
        $this->assertTrue($this->permissions()->hasPermission($this->manager, 'shifts.view_all_history'));
    }

    public function test_staff_can_view_own_shift_history_only_via_permission(): void
    {
        $this->assertTrue($this->permissions()->hasPermission($this->staff, 'shifts.view_own_history'));
        $this->assertFalse($this->permissions()->hasPermission($this->staff, 'shifts.view_all_history'));
    }

    public function test_staff_can_be_individually_allowed_to_void(): void
    {
        $this->staff->grantPermission('orders.void');

        $this->assertTrue($this->permissions()->hasPermission($this->staff, 'orders.void'));
    }

    public function test_manager_can_be_individually_denied_void(): void
    {
        $this->manager->revokePermission('orders.void');

        $this->assertFalse($this->permissions()->hasPermission($this->manager, 'orders.void'));
    }

    public function test_inherit_uses_role_default_when_override_removed(): void
    {
        $this->staff->grantPermission('orders.void');
        $this->assertTrue($this->permissions()->hasPermission($this->staff, 'orders.void'));

        $this->staff->resetPermission('orders.void');
        $this->staff->unsetRelation('permissions');

        $this->assertFalse($this->permissions()->hasPermission($this->staff, 'orders.void'));
    }

    public function test_auth_me_returns_pos_staff_fields(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.role', 'manager')
            ->assertJsonPath('user.pos_staff_role', 'manager')
            ->assertJsonStructure(['user' => ['permissions', 'pos_staff_permissions']]);
    }

    public function test_staff_void_endpoint_returns_403_without_permission(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $this->postJson('/api/orders/1/cancel', ['reason' => 'test'])
            ->assertStatus(403);
    }

    public function test_staff_active_orders_are_venue_wide(): void
    {
        $other = User::create([
            'name' => 'Other Staff', 'email' => 'other@test.com',
            'password' => Hash::make('password'), 'role_id' => $this->staff->role_id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $mine = Order::factory()->pending()->create(['user_id' => $this->staff->id]);
        $theirs = Order::factory()->pending()->create(['user_id' => $other->id]);
        $online = Order::factory()->onlinePickup()->pending()->create(['user_id' => null]);

        Sanctum::actingAs($this->staff, ['staff']);

        $ids = collect($this->getJson('/api/orders?active_only=1')
            ->assertOk()
            ->json('data'))
            ->pluck('id');

        $this->assertTrue($ids->contains($mine->id));
        $this->assertTrue($ids->contains($theirs->id));
        $this->assertTrue($ids->contains($online->id));
    }

    public function test_staff_receipts_scoped_to_own_sales(): void
    {
        $other = User::create([
            'name' => 'Other Staff 2', 'email' => 'other2@test.com',
            'password' => Hash::make('password'), 'role_id' => $this->staff->role_id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $mine = Order::factory()->paid()->create(['user_id' => $this->staff->id]);
        $theirs = Order::factory()->paid()->create(['user_id' => $other->id]);

        Sanctum::actingAs($this->staff, ['staff']);

        $ids = collect($this->getJson('/api/orders')
            ->assertOk()
            ->json('data'))
            ->pluck('id');

        $this->assertTrue($ids->contains($mine->id));
        $this->assertFalse($ids->contains($theirs->id));
    }

    public function test_staff_can_view_other_cashier_active_unpaid_order(): void
    {
        $order = Order::factory()->pending()->create([
            'user_id' => $this->manager->id,
            'payment_status' => 'unpaid',
        ]);

        Sanctum::actingAs($this->staff, ['staff']);

        $this->getJson("/api/orders/{$order->id}")
            ->assertOk();
    }

    public function test_staff_cannot_view_other_cashier_completed_receipt(): void
    {
        $order = Order::factory()->paid()->create([
            'user_id' => $this->manager->id,
            'status' => 'completed',
            'payment_status' => 'paid',
        ]);

        Sanctum::actingAs($this->staff, ['staff']);

        $this->getJson("/api/orders/{$order->id}")
            ->assertForbidden();
    }

    public function test_staff_denied_terminal_receipt_is_403_not_sanitized_200(): void
    {
        $order = Order::factory()->paid()->create([
            'user_id' => $this->manager->id,
            'status' => 'completed',
            'payment_status' => 'paid',
        ]);

        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->getJson("/api/orders/{$order->id}");

        $response->assertForbidden();
        $this->assertSame(403, $response->status());
        $response->assertJsonMissingPath('order');
        $response->assertJsonMissingPath('view');
        $this->assertArrayNotHasKey('customer', $response->json() ?? []);
        $this->assertArrayNotHasKey('payments', $response->json() ?? []);
    }

    public function test_staff_can_view_own_completed_receipt(): void
    {
        $order = Order::factory()->paid()->create([
            'user_id' => $this->staff->id,
            'status' => 'completed',
            'payment_status' => 'paid',
        ]);

        Sanctum::actingAs($this->staff, ['staff']);

        $this->getJson("/api/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('order.id', $order->id)
            ->assertJsonMissingPath('view');
    }

    public function test_manager_can_view_other_cashier_completed_receipt(): void
    {
        $order = Order::factory()->paid()->create([
            'user_id' => $this->staff->id,
            'status' => 'completed',
            'payment_status' => 'paid',
        ]);

        Sanctum::actingAs($this->manager, ['staff']);

        $this->getJson("/api/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('order.id', $order->id)
            ->assertJsonMissingPath('view');
    }

    public function test_completed_receipt_elevated_gates_are_not_in_default_staff_bundle(): void
    {
        $staffDefaults = PermissionCatalog::staffSlugs();

        // Either of these unlocks another cashier's finished sale; neither is a
        // default staff slug (unlike orders.receipts / pos.ring_sales).
        $this->assertNotContains('orders.manage', $staffDefaults);
        $this->assertNotContains('pos.view_all_station_orders', $staffDefaults);
        $this->assertContains('orders.receipts', $staffDefaults);
        $this->assertContains('pos.ring_sales', $staffDefaults);
    }

    public function test_staff_cannot_query_another_cashiers_user_id_filter(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $this->getJson('/api/orders?user_id=' . $this->manager->id)
            ->assertForbidden();
    }

    public function test_manager_can_list_active_orders_venue_wide(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        $this->getJson('/api/orders?active_only=1')
            ->assertOk();
    }

    public function test_manager_cannot_approve_devices_by_default(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        $device = Device::create([
            'name' => 'Pending POS',
            'identifier' => 'POS-PENDING',
            'type' => 'pos',
            'status' => 'pending',
            'is_active' => false,
        ]);

        $this->patchJson("/api/devices/{$device->id}/approve")
            ->assertStatus(403);
    }

    public function test_manager_can_list_devices_with_view_only_permission(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        Device::create([
            'name' => 'Front POS',
            'identifier' => 'POS-FRONT',
            'type' => 'pos',
            'status' => 'approved',
            'is_active' => true,
        ]);

        $this->getJson('/api/devices')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Front POS');
    }

    public function test_owner_can_approve_devices(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $device = Device::create([
            'name' => 'Pending POS',
            'identifier' => 'POS-PENDING2',
            'type' => 'pos',
            'status' => 'pending',
            'is_active' => false,
        ]);

        $this->patchJson("/api/devices/{$device->id}/approve")
            ->assertOk()
            ->assertJsonPath('device.status', 'approved');
    }

    public function test_role_permissions_api_updates_manager_defaults(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $payload = [];
        foreach (Permission::pluck('slug') as $slug) {
            $payload[$slug] = $slug !== 'orders.void';
        }

        $this->putJson('/api/roles/manager/permissions', ['permissions' => $payload])
            ->assertOk();

        $this->manager->unsetRelation('role');
        $this->manager->load('role.permissions');

        $this->assertFalse($this->permissions()->hasPermission($this->manager, 'orders.void'));
    }

    public function test_website_manage_alone_does_not_open_roles_permissions_routes(): void
    {
        // website.manage must not satisfy roles_permissions.manage (privilege
        // escalation hole). Use a non-owner so the owner short-circuit cannot
        // mask the alias check — see WebsiteManagePrivilegeEscalationTest.
        $staffRole = Role::where('slug', 'staff')->firstOrFail();
        $editor = User::create([
            'name' => 'Content Editor',
            'email' => 'content-editor@test.local',
            'phone' => '7700999',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $editor->grantPermission('website.manage');

        Sanctum::actingAs($editor, ['staff']);

        $this->getJson('/api/permissions')
            ->assertForbidden();
    }

    public function test_staff_without_ring_sales_cannot_create_order(): void
    {
        $this->staff->revokePermission('pos.ring_sales');
        $this->staff->revokePermission('orders.create');

        Sanctum::actingAs($this->staff, ['staff']);

        $this->withHeader('X-Device-Identifier', 'test-device')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => 1, 'quantity' => 1]],
            ])
            ->assertForbidden();
    }

    public function test_staff_without_open_shift_permission_cannot_open_shift(): void
    {
        $this->staff->revokePermission('pos.open_shift');
        $this->staff->revokePermission('finance.cash_manage');
        $this->staff->revokePermission('payments.cash_manage');

        Sanctum::actingAs($this->staff, ['staff']);

        $this->postJson('/api/shifts/open', ['opening_cash' => 100])
            ->assertForbidden();
    }

    public function test_staff_phone_login_rejected_without_admin_access(): void
    {
        $this->assertFalse($this->permissions()->hasPermission($this->staff, 'admin.access'));

        $this->postJson('/api/auth/staff/login', [
            'phone' => '7700003',
            'password' => 'password',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_manager_phone_login_succeeds_with_admin_access(): void
    {
        $this->assertTrue($this->permissions()->hasPermission($this->manager, 'admin.access'));

        $this->postJson('/api/auth/staff/login', [
            'phone' => '7700002',
            'password' => 'password',
        ])->assertOk()
            ->assertJsonStructure(['user' => ['permissions']])
            ->assertJsonMissingPath('token');
    }
}
