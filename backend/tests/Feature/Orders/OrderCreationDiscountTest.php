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

class OrderCreationDiscountTest extends TestCase
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
            'name' => 'Staff Create Disc',
            'email' => 'staff-create-disc@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->value('id'),
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->staff->grantPermission('promotions.discounts');
        // A discount needs an approver (owner, 2026-09-02). This suite is
        // about what gets persisted, so the actor is their own approver.
        $this->staff->grantPermission('promotions.discount_override');
        $this->staff->unsetRelation('permissions');
        $this->staff->unsetRelation('permissions');

        $this->device = Device::create([
            'name' => 'POS',
            'identifier' => 'CREATE-DISC-1',
            'type' => 'pos',
            'is_active' => true,
        ]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-create-disc', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Burger',
            'base_price' => 100.00,
            'sku' => 'CREATE-DISC-B001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->preparePosApi($this->staff, $this->device);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
    }

    public function test_create_with_discount_persists_reason_and_totals(): void
    {
        SiteSetting::set(DiscountSettings::REASON_REQUIRED, 'true');
        SiteSetting::set(DiscountSettings::REASONS, json_encode(['Loyal customer', 'Other (note required)']));
        SiteSetting::bust();

        $res = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            'discount_amount' => 25,
            'discount_reason' => 'Loyal customer',
            'discount_reason_note' => 'VIP',
        ])->assertCreated();

        $order = Order::findOrFail((int) $res->json('order.id'));
        $this->assertSame(2500, (int) $order->manual_discount_laar);
        $this->assertSame('Loyal customer', $order->manual_discount_reason);
        $this->assertSame('VIP', $order->manual_discount_reason_note);
        $this->assertLessThan(100.0, (float) $order->total);
    }

    public function test_create_with_default_settings_allows_full_subtotal_discount(): void
    {
        $res = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            'discount_amount' => 100,
        ])->assertCreated();

        $order = Order::findOrFail((int) $res->json('order.id'));
        $this->assertSame(10000, (int) $order->manual_discount_laar);
    }

    public function test_create_above_cap_is_422(): void
    {
        SiteSetting::set(DiscountSettings::MAX_PERCENT, '10');
        SiteSetting::bust();

        $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            'discount_amount' => 50,
        ])->assertStatus(422);
    }
}
