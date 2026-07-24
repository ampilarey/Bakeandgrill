<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class UpdateOrderItemsDiscountTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        $this->staff = User::create([
            'name' => 'Staff',
            'email' => 'staff-disc@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->device = Device::create([
            'name' => 'POS',
            'identifier' => 'DISC-POS-1',
            'type' => 'pos',
            'is_active' => true,
        ]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-disc', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Burger',
            'base_price' => 100.00,
            'sku' => 'DISC-B001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->preparePosApi($this->staff, $this->device);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
    }

    private function grantDiscountPermission(): void
    {
        $perm = Permission::where('slug', 'promotions.discounts')->firstOrFail();
        $this->staff->grantPermission($perm->slug);
        $this->staff->unsetRelation('permissions');
    }

    private function createOpenOrder(): int
    {
        $create = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated();

        return (int) $create->json('order.id');
    }

    public function test_patch_discount_amount_reduces_total(): void
    {
        $this->grantDiscountPermission();
        $orderId = $this->createOpenOrder();
        $before = (float) Order::findOrFail($orderId)->total;

        $this->patchJson("/api/orders/{$orderId}/items", [
            'items' => [[
                'item_id' => $this->item->id,
                'name' => $this->item->name,
                'quantity' => 1,
            ]],
            'reprint_kitchen' => false,
            'discount_amount' => 20,
        ])
            ->assertOk()
            ->assertJsonPath('order.id', $orderId);

        $order = Order::findOrFail($orderId);
        $this->assertSame(2000, (int) $order->manual_discount_laar);
        $this->assertLessThan($before, (float) $order->total);
    }

    public function test_patch_discount_without_permission_is_403(): void
    {
        $this->staff->revokePermission('promotions.discounts');
        $this->staff->unsetRelation('permissions');
        $orderId = $this->createOpenOrder();

        $this->patchJson("/api/orders/{$orderId}/items", [
            'items' => [[
                'item_id' => $this->item->id,
                'name' => $this->item->name,
                'quantity' => 1,
            ]],
            'reprint_kitchen' => false,
            'discount_amount' => 10,
        ])->assertForbidden();
    }

    public function test_patch_discount_clamped_to_subtotal(): void
    {
        $this->grantDiscountPermission();
        $orderId = $this->createOpenOrder();

        $this->patchJson("/api/orders/{$orderId}/items", [
            'items' => [[
                'item_id' => $this->item->id,
                'name' => $this->item->name,
                'quantity' => 1,
            ]],
            'reprint_kitchen' => false,
            'discount_amount' => 9999,
        ])->assertStatus(422);

        // Exact subtotal still applies (hard ceiling = subtotal).
        $this->patchJson("/api/orders/{$orderId}/items", [
            'items' => [[
                'item_id' => $this->item->id,
                'name' => $this->item->name,
                'quantity' => 1,
            ]],
            'reprint_kitchen' => false,
            'discount_amount' => 100,
        ])->assertOk();

        $order = Order::findOrFail($orderId);
        $this->assertSame((int) $order->subtotal_laar, (int) $order->manual_discount_laar);
    }
}
