<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderPromotion;
use App\Models\Permission;
use App\Models\Promotion;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class AutoPromoCheckoutTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $item;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        $this->staff = User::create([
            'name' => 'Staff', 'email' => 'staff-checkout@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->device = Device::create(['name' => 'POS', 'identifier' => 'T-CHK', 'type' => 'pos', 'is_active' => true]);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-chk', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Burger', 'base_price' => 100.00,
            'sku' => 'CHK-B001', 'barcode' => 'CHK-B001', 'is_active' => true, 'is_available' => true,
        ]);
        $this->customer = Customer::create([
            'name' => 'Test Customer', 'phone' => '+9607008888',
            'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true,
        ]);

        Permission::updateOrCreate(
            ['slug' => 'promotions.discounts'],
            ['name' => 'Apply Discounts', 'group' => 'Promotions'],
        );
        $this->staff->grantPermission('promotions.discounts');
        $this->preparePosApi($this->staff, $this->device);
    }

    public function test_order_creation_applies_auto_promo_and_records_order_promotion(): void
    {
        $promo = Promotion::create([
            'name' => 'Auto 10%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 10,
            'is_active' => true,
            'auto_apply' => true,
            'stackable' => false,
            'scope' => 'order',
        ]);

        Sanctum::actingAs($this->staff, ['staff']);
        $response = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'customer_id' => $this->customer->id,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);

        $response->assertCreated();
        $orderId = (int) $response->json('order.id');
        $order = Order::findOrFail($orderId);

        $this->assertDatabaseHas('order_promotions', [
            'order_id' => $orderId,
            'promotion_id' => $promo->id,
            'status' => 'draft',
        ]);
        $this->assertGreaterThan(0, (int) $order->promo_discount_laar);
        $this->assertSame(1000, (int) $order->promo_discount_laar);
    }

    public function test_coded_promo_still_applies_after_auto(): void
    {
        Promotion::create([
            'name' => 'Auto 5%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 5,
            'is_active' => true,
            'auto_apply' => true,
            'stackable' => true,
            'scope' => 'order',
        ]);
        $coded = Promotion::create([
            'name' => 'Coded',
            'code' => 'EXTRA5',
            'type' => 'percentage',
            'discount_value' => 5,
            'is_active' => true,
            'auto_apply' => false,
            'stackable' => true,
        ]);

        Sanctum::actingAs($this->staff, ['staff']);
        $create = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'customer_id' => $this->customer->id,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated();

        $orderId = (int) $create->json('order.id');
        $this->assertSame(1, OrderPromotion::where('order_id', $orderId)->where('status', 'draft')->count());

        $this->postJson("/api/orders/{$orderId}/apply-promo", [
            'code' => 'EXTRA5',
        ])->assertOk();

        $this->assertDatabaseHas('order_promotions', [
            'order_id' => $orderId,
            'promotion_id' => $coded->id,
            'status' => 'draft',
        ]);
        // Auto + coded both draft when stackable
        $this->assertGreaterThanOrEqual(2, OrderPromotion::where('order_id', $orderId)->where('status', 'draft')->count());
    }

    public function test_no_double_discount_best_wins_among_autos(): void
    {
        Promotion::create([
            'name' => 'Auto 10%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 10,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'order',
        ]);
        Promotion::create([
            'name' => 'Auto 15%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 15,
            'is_active' => true,
            'auto_apply' => true,
            'scope' => 'order',
        ]);

        Sanctum::actingAs($this->staff, ['staff']);
        $response = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated();

        $orderId = (int) $response->json('order.id');
        $this->assertSame(1, OrderPromotion::where('order_id', $orderId)->where('status', 'draft')->count());
        $this->assertSame(1500, (int) Order::findOrFail($orderId)->promo_discount_laar);
    }
}
