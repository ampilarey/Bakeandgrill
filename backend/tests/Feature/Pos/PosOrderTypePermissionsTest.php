<?php

declare(strict_types=1);

namespace Tests\Feature\Pos;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * Owner, 2026-10-07: "Set permission settings so i can turn off each type
 * for all, for example pick up and delivery turns off for staffs and on for
 * a specific staff only. I need full control."
 */
class PosOrderTypePermissionsTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['owner' => 'Owner', 'manager' => 'Manager', 'staff' => 'Staff', 'kitchen_staff' => 'Kitchen Staff'] as $slug => $name) {
            Role::firstOrCreate(['slug' => $slug], ['name' => $name, 'is_active' => true]);
        }
        PermissionCatalogSync::sync();
        $this->device = Device::create(['name' => 'Till', 'identifier' => 'OT-POS-1', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-ot', 'is_active' => true]);
        $this->item = Item::create(['category_id' => $category->id, 'name' => 'Burger', 'base_price' => 50, 'sku' => 'OT-1', 'is_active' => true, 'is_available' => true]);
    }

    private function staff(string $role = 'staff', string $phone = '+9607001001'): User
    {
        return User::factory()->create(['phone' => $phone, 'is_active' => true, 'role_id' => Role::where('slug', $role)->value('id')]);
    }

    /** What Admin → Roles & Permissions does when a type is switched off for a role. */
    private function turnOffForRole(string $role, string $slug): void
    {
        // A role save records the owner's change, so a deploy's sync keeps it.
        \App\Domains\Permissions\RolePermissionCustomisations::recordFrom($role, [$slug => false]);
        Role::where('slug', $role)->firstOrFail()->permissions()->detach(Permission::where('slug', $slug)->value('id'));
    }

    private function ring(string $type): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('X-Device-Identifier', $this->device->identifier)->postJson('/api/orders', [
            'type' => $type,
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);
    }

    public function test_every_role_that_rang_sales_keeps_every_type_by_default(): void
    {
        $cashier = $this->staff();
        $this->preparePosApi($cashier, $this->device);

        foreach (['dine_in', 'takeaway', 'online_pickup'] as $type) {
            $this->ring($type)->assertCreated();
        }
    }

    public function test_pickup_off_for_staff_and_on_for_one_person(): void
    {
        $this->turnOffForRole('staff', 'pos.order_type.pickup');
        $this->turnOffForRole('staff', 'pos.order_type.delivery');
        $cashier = $this->staff();
        $this->preparePosApi($cashier, $this->device);

        $this->ring('online_pickup')->assertForbidden()
            ->assertJsonPath('message', 'You are not allowed to ring Pickup orders. Ask the owner to allow it in Admin → Staff.');
        $this->ring('dine_in')->assertCreated();
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders/delivery', ['items' => [['item_id' => $this->item->id, 'quantity' => 1]]])
            ->assertForbidden();

        // Allowed for this one person on their staff page.
        $cashier->grantPermission('pos.order_type.pickup');
        $cashier->unsetRelation('permissions');
        $this->ring('online_pickup')->assertCreated();

        // Another cashier on the same role still cannot.
        $other = $this->staff('staff', '+9607001002');
        $this->assertFalse(\App\Domains\Orders\Support\PosOrderTypeGate::allows($other, 'online_pickup'));
        $this->assertTrue(\App\Domains\Orders\Support\PosOrderTypeGate::allows($other, 'dine_in'));
    }

    public function test_a_person_can_be_denied_a_type_their_role_has(): void
    {
        $cashier = $this->staff();
        $cashier->revokePermission('pos.order_type.takeaway');
        $this->preparePosApi($cashier, $this->device);

        $this->ring('takeaway')->assertForbidden();
        $this->ring('dine_in')->assertCreated();
    }

    public function test_switching_an_order_to_a_type_that_is_off_is_refused(): void
    {
        $this->turnOffForRole('staff', 'pos.order_type.pickup');
        $cashier = $this->staff();
        $this->preparePosApi($cashier, $this->device);
        $id = (int) $this->ring('dine_in')->assertCreated()->json('order.id');

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->patchJson("/api/orders/{$id}/items", [
                'items' => [['item_id' => $this->item->id, 'name' => 'Burger', 'quantity' => 1]],
                'type' => 'online_pickup',
            ])->assertForbidden();
        $this->assertSame('dine_in', Order::findOrFail($id)->type);

        // Editing it without changing the type is fine.
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->patchJson("/api/orders/{$id}/items", [
                'items' => [['item_id' => $this->item->id, 'name' => 'Burger', 'quantity' => 2]],
            ])->assertOk();
    }

    public function test_a_batch_sync_skips_only_the_order_of_a_type_that_is_off(): void
    {
        $this->turnOffForRole('staff', 'pos.order_type.pickup');
        $cashier = $this->staff();
        $this->preparePosApi($cashier, $this->device);

        $res = $this->withHeader('X-Device-Identifier', $this->device->identifier)->postJson('/api/orders/sync', ['orders' => [
            ['type' => 'dine_in', 'items' => [['item_id' => $this->item->id, 'name' => 'Burger', 'quantity' => 1]]],
            ['type' => 'online_pickup', 'items' => [['item_id' => $this->item->id, 'name' => 'Burger', 'quantity' => 1]]],
        ]])->assertOk();

        $this->assertSame(1, $res->json('processed'));
        $this->assertSame(1, $res->json('failed.0.index'));
        $this->assertStringContainsString('Pickup', (string) $res->json('failed.0.error'));
    }

    public function test_the_owner_is_never_blocked(): void
    {
        $this->turnOffForRole('owner', 'pos.order_type.pickup');
        $owner = $this->staff('owner', '+9607820288');
        $this->preparePosApi($owner, $this->device);

        $this->ring('online_pickup')->assertCreated();
    }

    public function test_the_migration_keeps_types_for_custom_roles_and_personal_grants(): void
    {
        $custom = Role::create(['slug' => 'senior_cashier', 'name' => 'Senior cashier', 'is_active' => true]);
        $custom->permissions()->attach(Permission::where('slug', 'pos.ring_sales')->value('id'));
        $chef = $this->staff('kitchen_staff', '+9607001009');
        $chef->grantPermission('pos.ring_sales');
        Permission::whereIn('slug', \App\Domains\Permissions\PermissionCatalog::ORDER_TYPE_SLUGS)->get()
            ->each(fn (Permission $p) => $custom->permissions()->detach($p->id));

        (require database_path('migrations/2026_10_08_140000_pos_order_type_permissions.php'))->up();

        $this->assertTrue($custom->fresh()->permissions->contains('slug', 'pos.order_type.pickup'));
        $this->assertTrue($chef->fresh()->hasPermission('pos.order_type.delivery'));
    }

    public function test_the_login_list_carries_the_types_for_the_till(): void
    {
        $this->turnOffForRole('staff', 'pos.order_type.delivery');
        $cashier = $this->staff();
        Sanctum::actingAs($cashier, ['staff']);

        $perms = app(\App\Domains\Permissions\Services\PermissionService::class)->grantedSlugs($cashier);
        $this->assertContains('pos.order_type.dine_in', $perms);
        $this->assertNotContains('pos.order_type.delivery', $perms);
    }
}
