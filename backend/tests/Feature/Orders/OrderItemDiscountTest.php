<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Orders\Support\DiscountSettings;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class OrderItemDiscountTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->staff = User::create([
            'name' => 'Staff Item Disc',
            'email' => 'staff-item-disc@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->value('id'),
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->staff->grantPermission('promotions.discounts');
        $this->staff->unsetRelation('permissions');

        $this->device = Device::create([
            'name' => 'POS',
            'identifier' => 'ITEM-DISC-1',
            'type' => 'pos',
            'is_active' => true,
        ]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-item-disc', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Burger',
            'base_price' => 100.00,
            'sku' => 'ITEM-DISC-B001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->preparePosApi($this->staff, $this->device);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
    }

    private function createOpenOrder(): int
    {
        return (int) $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated()->json('order.id');
    }

    public function test_patch_persists_reason_columns(): void
    {
        SiteSetting::set(DiscountSettings::REASON_REQUIRED, 'true');
        SiteSetting::set(DiscountSettings::REASONS, json_encode(['Manager comp']));
        SiteSetting::bust();

        $orderId = $this->createOpenOrder();

        $this->patchJson("/api/orders/{$orderId}/items", [
            'items' => [[
                'item_id' => $this->item->id,
                'name' => $this->item->name,
                'quantity' => 1,
            ]],
            'reprint_kitchen' => false,
            'discount_amount' => 12.5,
            'discount_reason' => 'Manager comp',
            'discount_reason_note' => 'Comp',
        ])->assertOk();

        $order = Order::findOrFail($orderId);
        $this->assertSame(1250, (int) $order->manual_discount_laar);
        $this->assertSame('Manager comp', $order->manual_discount_reason);
        $this->assertSame('Comp', $order->manual_discount_reason_note);
    }

    public function test_patch_above_cap_rejected(): void
    {
        SiteSetting::set(DiscountSettings::MAX_FIXED_MVR, '5');
        SiteSetting::bust();

        $orderId = $this->createOpenOrder();

        $this->patchJson("/api/orders/{$orderId}/items", [
            'items' => [[
                'item_id' => $this->item->id,
                'name' => $this->item->name,
                'quantity' => 1,
            ]],
            'reprint_kitchen' => false,
            'discount_amount' => 20,
        ])->assertStatus(422);
    }
}
