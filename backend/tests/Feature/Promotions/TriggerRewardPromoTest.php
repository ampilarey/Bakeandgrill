<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Promotion;
use App\Models\PromotionTarget;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class TriggerRewardPromoTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private const DEVICE_ID = 'TRIG-REWARD-POS';

    private Category $food;

    private Category $drinks;

    private Item $meal;

    private Item $drink;

    private Item $drink2;

    private Customer $customer;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $this->food = Category::create(['name' => 'Meals', 'slug' => 'meals-tr', 'is_active' => true]);
        $this->drinks = Category::create(['name' => 'Drinks', 'slug' => 'drinks-tr', 'is_active' => true]);

        $this->meal = Item::create([
            'category_id' => $this->food->id,
            'name' => 'Chicken Meal',
            'base_price' => 80,
            'cost' => 30,
            'sku' => 'MEAL-TR',
            'is_active' => true,
            'is_available' => true,
        ]);
        $this->drink = Item::create([
            'category_id' => $this->drinks->id,
            'name' => 'Cola',
            'base_price' => 15,
            'cost' => 3,
            'sku' => 'DRINK-TR',
            'is_active' => true,
            'is_available' => true,
        ]);
        $this->drink2 = Item::create([
            'category_id' => $this->drinks->id,
            'name' => 'Juice',
            'base_price' => 20,
            'cost' => 4,
            'sku' => 'DRINK2-TR',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'TR Customer',
            'phone' => '+9607771234',
            'is_active' => true,
        ]);

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'TR Cashier',
            'email' => 'tr-cashier@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        Device::create([
            'name' => 'TR POS',
            'identifier' => self::DEVICE_ID,
            'type' => 'pos',
            'is_active' => true,
        ]);
    }

    private function makeMealDrinkPromo(int $triggerMinQty = 1): Promotion
    {
        $promo = Promotion::create([
            'name' => 'Free drink with meal',
            'code' => null,
            'type' => 'free_item',
            'discount_value' => 0,
            'auto_apply' => true,
            'is_active' => true,
            'stackable' => false,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->meal->id,
            'is_exclusion' => false,
            'role' => 'trigger',
            'metadata' => ['min_qty' => $triggerMinQty],
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->drink->id,
            'is_exclusion' => false,
            'role' => 'reward',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->drink2->id,
            'is_exclusion' => false,
            'role' => 'reward',
        ]);

        return $promo->fresh('targets');
    }

    private function orderWith(array $lines): Order
    {
        $subtotal = 0;
        foreach ($lines as [$item, $qty]) {
            $subtotal += (float) $item->base_price * $qty;
        }
        $order = Order::create([
            'order_number' => 'TR' . random_int(1000, 9999),
            'type' => 'takeaway',
            'status' => 'pending',
            'customer_id' => $this->customer->id,
            'subtotal' => $subtotal,
            'subtotal_laar' => (int) round($subtotal * 100),
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => $subtotal,
            'total_laar' => (int) round($subtotal * 100),
        ]);
        foreach ($lines as [$item, $qty]) {
            OrderItem::create([
                'order_id' => $order->id,
                'item_id' => $item->id,
                'item_name' => $item->name,
                'quantity' => $qty,
                'unit_price' => $item->base_price,
                'total_price' => (float) $item->base_price * $qty,
            ]);
        }

        return $order->fresh(['items.item']);
    }

    public function test_basket_without_trigger_gets_no_discount(): void
    {
        $promo = $this->makeMealDrinkPromo();
        $order = $this->orderWith([[$this->drink, 1]]);
        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);
        $this->assertCount(0, $applied);
        $this->assertFalse(app(PromotionEvaluator::class)->triggersSatisfied($promo, $order));
    }

    public function test_basket_with_trigger_discounts_only_reward(): void
    {
        $this->makeMealDrinkPromo();
        $order = $this->orderWith([[$this->meal, 1], [$this->drink, 1]]);
        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);
        $this->assertCount(1, $applied);
        // Free the drink (15 MVR), not the meal.
        $this->assertSame(1500, $applied[0]['discount_laar']);
    }

    public function test_trigger_min_qty_2_not_satisfied_by_1(): void
    {
        $promo = $this->makeMealDrinkPromo(2);
        $order = $this->orderWith([[$this->meal, 1], [$this->drink, 1]]);
        $this->assertFalse(app(PromotionEvaluator::class)->triggersSatisfied($promo, $order));
        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);
        $this->assertCount(0, $applied);
    }

    public function test_trigger_line_not_discounted_as_own_reward(): void
    {
        $promo = Promotion::create([
            'name' => 'Buy burger get burger free leak',
            'type' => 'free_item',
            'discount_value' => 0,
            'auto_apply' => true,
            'is_active' => true,
            'stackable' => false,
            'scope' => 'item',
        ]);
        // Same item as trigger AND reward — must not free that burger.
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->meal->id,
            'role' => 'trigger',
            'metadata' => ['min_qty' => 1],
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->meal->id,
            'role' => 'reward',
        ]);

        $order = $this->orderWith([[$this->meal, 1]]);
        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);
        $this->assertCount(0, $applied, 'Trigger line must not be its own free reward');
    }

    public function test_money_leak_closed_drink_alone_full_price(): void
    {
        $this->makeMealDrinkPromo();
        // Drink alone — the leak: old engine would free it; new engine must not.
        $order = $this->orderWith([[$this->drink, 1]]);
        $applied = app(PromotionEvaluator::class)->applyAutomatic($order, $this->customer->id);
        $this->assertCount(0, $applied);

        $withMeal = $this->orderWith([[$this->meal, 1], [$this->drink, 1]]);
        $applied2 = app(PromotionEvaluator::class)->applyAutomatic($withMeal, $this->customer->id);
        $this->assertCount(1, $applied2);
        $this->assertSame(1500, $applied2[0]['discount_laar']);
    }

    public function test_identical_on_pos_and_online_create(): void
    {
        $this->makeMealDrinkPromo();

        Sanctum::actingAs($this->staff, ['staff']);
        $this->ensurePosApiReady($this->staff, self::DEVICE_ID);
        $pos = $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [
                    ['item_id' => $this->meal->id, 'quantity' => 1],
                    ['item_id' => $this->drink->id, 'quantity' => 1],
                ],
            ]);
        $this->assertSame(201, $pos->status(), $pos->getContent());
        $posDiscount = (int) ($pos->json('order.promo_discount_laar') ?? 0);

        Sanctum::actingAs($this->customer, ['customer']);
        $online = $this->postJson('/api/customer/orders', [
            'type' => 'online_pickup',
            'items' => [
                ['item_id' => $this->meal->id, 'quantity' => 1],
                ['item_id' => $this->drink->id, 'quantity' => 1],
            ],
        ]);
        $this->assertSame(201, $online->status(), $online->getContent());
        $onlineDiscount = (int) ($online->json('order.promo_discount_laar') ?? 0);

        $this->assertSame(1500, $posDiscount);
        $this->assertSame($posDiscount, $onlineDiscount);
    }

    public function test_unearned_reward_claim_rejected(): void
    {
        $promo = $this->makeMealDrinkPromo();

        Sanctum::actingAs($this->customer, ['customer']);
        $response = $this->postJson('/api/customer/orders', [
            'type' => 'online_pickup',
            'items' => [
                ['item_id' => $this->drink->id, 'quantity' => 1],
            ],
            'reward_claims' => [
                ['promotion_id' => $promo->id, 'item_id' => $this->drink->id],
            ],
        ]);
        $this->assertSame(422, $response->status(), $response->getContent());
        $this->assertStringContainsString('not available', strtolower($response->json('message') ?? $response->getContent()));
    }

    public function test_cart_rewards_endpoint_lists_choices_when_qualified(): void
    {
        $this->makeMealDrinkPromo();

        $qualified = $this->postJson('/api/promotions/cart-rewards', [
            'items' => [
                ['item_id' => $this->meal->id, 'quantity' => 1, 'unit_price' => 80],
            ],
        ]);
        $qualified->assertOk();
        $this->assertCount(1, $qualified->json('rewards'));
        $this->assertCount(2, $qualified->json('rewards.0.reward_items'));

        $unqualified = $this->postJson('/api/promotions/cart-rewards', [
            'items' => [
                ['item_id' => $this->drink->id, 'quantity' => 1, 'unit_price' => 15],
            ],
        ]);
        $unqualified->assertOk();
        $this->assertCount(0, $unqualified->json('rewards'));
    }

    public function test_percentage_off_reward_items_with_trigger(): void
    {
        $promo = Promotion::create([
            'name' => '20% off fries with burger',
            'type' => 'percentage',
            'discount_value' => 20,
            'auto_apply' => true,
            'is_active' => true,
            'stackable' => false,
            'scope' => 'item',
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->meal->id,
            'role' => 'trigger',
            'metadata' => ['min_qty' => 1],
        ]);
        PromotionTarget::create([
            'promotion_id' => $promo->id,
            'target_type' => 'item',
            'target_id' => $this->drink->id,
            'role' => 'reward',
        ]);

        $with = $this->orderWith([[$this->meal, 1], [$this->drink, 1]]);
        $applied = app(PromotionEvaluator::class)->applyAutomatic($with, $this->customer->id);
        $this->assertCount(1, $applied);
        // 20% of drink 15 = 3 MVR = 300 laari
        $this->assertSame(300, $applied[0]['discount_laar']);

        $without = $this->orderWith([[$this->drink, 1]]);
        $this->assertCount(0, app(PromotionEvaluator::class)->applyAutomatic($without, $this->customer->id));
    }
}
