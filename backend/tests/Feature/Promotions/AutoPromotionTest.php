<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderPromotion;
use App\Models\Permission;
use App\Models\Promotion;
use App\Models\PromotionTarget;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class AutoPromotionTest extends TestCase
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
            'name' => 'Staff', 'email' => 'staff-auto@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->device = Device::create(['name' => 'POS', 'identifier' => 'T-AUTO', 'type' => 'pos', 'is_active' => true]);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-auto', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Burger', 'base_price' => 100.00,
            'sku' => 'AUTO-B001', 'barcode' => 'AUTO-B001', 'is_active' => true, 'is_available' => true,
        ]);
        $this->customer = Customer::create([
            'name' => 'Test Customer', 'phone' => '+9607009999',
            'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true,
        ]);

        Permission::updateOrCreate(
            ['slug' => 'promotions.discounts'],
            ['name' => 'Apply Discounts', 'group' => 'Promotions'],
        );
        $this->staff->grantPermission('promotions.discounts');
        $this->preparePosApi($this->staff, $this->device);
    }

    private function createAutoPromo(array $attrs = []): Promotion
    {
        return Promotion::create(array_merge([
            'name' => 'Auto 10%',
            'code' => null,
            'type' => 'percentage',
            'discount_value' => 10,
            'is_active' => true,
            'auto_apply' => true,
            'stackable' => false,
            'scope' => 'order',
        ], $attrs));
    }

    private function buildOrder(float $lineTotal = 100.00): Order
    {
        $order = Order::create([
            'order_number' => 'A' . random_int(1000, 9999),
            'type' => 'takeaway',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'customer_id' => $this->customer->id,
            'subtotal' => $lineTotal,
            'subtotal_laar' => (int) round($lineTotal * 100),
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => $lineTotal,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => $lineTotal,
            'total_price' => $lineTotal,
        ]);

        return $order->fresh(['items.item']);
    }

    public function test_auto_apply_promo_applies_without_code(): void
    {
        $promo = $this->createAutoPromo();
        $order = $this->buildOrder(100.00);

        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);

        $this->assertCount(1, $applied);
        $this->assertSame($promo->id, $applied[0]['promotion']->id);
        $this->assertSame(1000, $applied[0]['discount_laar']); // 10% of 100.00
        $this->assertDatabaseHas('order_promotions', [
            'order_id' => $order->id,
            'promotion_id' => $promo->id,
            'discount_laar' => 1000,
            'status' => 'draft',
        ]);
        $this->assertSame(1000, (int) $order->fresh()->promo_discount_laar);
    }

    public function test_auto_apply_respects_min_order(): void
    {
        $this->createAutoPromo(['min_order_laar' => 20000]); // MVR 200
        $order = $this->buildOrder(100.00);

        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);

        $this->assertSame([], $applied);
        $this->assertSame(0, OrderPromotion::where('order_id', $order->id)->count());
    }

    public function test_auto_apply_respects_item_targets(): void
    {
        $other = Item::create([
            'category_id' => $this->item->category_id,
            'name' => 'Fries',
            'base_price' => 50.00,
            'sku' => 'AUTO-F001',
            'barcode' => 'AUTO-F001',
            'is_active' => true,
            'is_available' => true,
        ]);
        $promo = $this->createAutoPromo(['scope' => 'item']);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $other->id,
            'is_exclusion' => false,
        ]);

        $order = $this->buildOrder(100.00); // only burger, not fries
        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);

        $this->assertSame([], $applied);
    }

    public function test_auto_apply_respects_expiry(): void
    {
        $this->createAutoPromo(['expires_at' => now()->subDay()]);
        $order = $this->buildOrder(100.00);

        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);

        $this->assertSame([], $applied);
    }

    public function test_coded_and_restricted_promos_unchanged(): void
    {
        $coded = Promotion::create([
            'name' => 'Coded',
            'code' => 'SAVE10',
            'type' => 'percentage',
            'discount_value' => 10,
            'is_active' => true,
            'auto_apply' => false,
            'stackable' => false,
        ]);
        $restricted = Promotion::create([
            'name' => 'Personal',
            'code' => 'VIP10',
            'type' => 'percentage',
            'discount_value' => 10,
            'is_active' => true,
            'auto_apply' => false,
            'restricted_customer_id' => $this->customer->id,
        ]);

        $order = $this->buildOrder(100.00);
        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);
        $this->assertSame([], $applied);

        $result = app(PromotionEvaluator::class)->evaluate('SAVE10', $order, $this->customer->id);
        $this->assertTrue($result['valid']);
        $this->assertSame($coded->id, $result['promotion']->id);

        $result2 = app(PromotionEvaluator::class)->evaluate('VIP10', $order, $this->customer->id);
        $this->assertTrue($result2['valid']);
        $this->assertSame($restricted->id, $result2['promotion']->id);

        $other = Customer::create([
            'name' => 'Other', 'phone' => '+9607001111',
            'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true,
        ]);
        $result3 = app(PromotionEvaluator::class)->evaluate('VIP10', $order, $other->id);
        $this->assertFalse($result3['valid']);
    }

    public function test_admin_can_create_auto_apply_without_code(): void
    {
        $ownerRole = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        $owner = User::create([
            'name' => 'Owner', 'email' => 'owner-auto@test.com',
            'password' => Hash::make('password'), 'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        Permission::updateOrCreate(
            ['slug' => 'promotions.manage'],
            ['name' => 'Manage Promotions', 'group' => 'Promotions'],
        );
        $owner->grantPermission('promotions.manage');
        Sanctum::actingAs($owner, ['staff']);

        $response = $this->postJson('/api/admin/promotions', [
            'name' => 'Happy Hour',
            'auto_apply' => true,
            'type' => 'percentage',
            'discount_value' => 15,
            'is_active' => true,
            'scope' => 'order',
            'days_of_week' => [(int) now()->dayOfWeek],
        ]);

        $response->assertCreated();
        $this->assertTrue((bool) $response->json('promotion.auto_apply'));
        $promo = Promotion::find($response->json('promotion.id'));
        $this->assertNotNull($promo);
        $this->assertTrue($promo->auto_apply);
        // Code may be null (MySQL) or AUTO-* sentinel (sqlite)
        if ($promo->code !== null) {
            $this->assertStringStartsWith('AUTO-', $promo->code);
        }
    }

    public function test_best_wins_picks_largest_auto_promo(): void
    {
        $this->createAutoPromo(['name' => 'Small', 'discount_value' => 5]);
        $big = $this->createAutoPromo(['name' => 'Big', 'discount_value' => 20, 'code' => null]);
        $order = $this->buildOrder(100.00);

        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);

        $this->assertCount(1, $applied);
        $this->assertSame($big->id, $applied[0]['promotion']->id);
        $this->assertSame(2000, $applied[0]['discount_laar']);
    }
}
