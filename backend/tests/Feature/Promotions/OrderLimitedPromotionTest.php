<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions;

use App\Domains\Promotions\Services\AutoPromotionPricing;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\Promotion;
use App\Models\PromotionTarget;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * Owner, 2026-11-08: "today all online orders will get 10% discount, or all dine in customers will
 * get 100% discount on a dish", "it could be a specific date and a specific time period", "a dish
 * free with a curry or another item", "online mean order app", "1 per curry or selected item".
 */
class OrderLimitedPromotionTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $curry;

    private Item $roshi;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Staff', 'email' => 'staff-limits@test.com',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $this->device = Device::create(['name' => 'POS', 'identifier' => 'T-LIMITS', 'type' => 'pos', 'is_active' => true]);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);
        $food = Category::create(['name' => 'Food', 'slug' => 'food-limits', 'is_active' => true]);
        $this->curry = Item::create(['category_id' => $food->id, 'name' => 'Chicken Curry', 'base_price' => 60, 'sku' => 'LIM-C', 'is_active' => true, 'is_available' => true]);
        $this->roshi = Item::create(['category_id' => $food->id, 'name' => 'Roshi', 'base_price' => 5, 'sku' => 'LIM-R', 'is_active' => true, 'is_available' => true]);
        $this->preparePosApi($this->staff, $this->device);
    }

    /** @param array<string, mixed> $extra */
    private function offer(array $extra): Promotion
    {
        $p = Promotion::create(array_merge([
            'name' => 'Offer', 'code' => null, 'type' => 'percentage', 'discount_value' => 10,
            'is_active' => true, 'auto_apply' => true, 'stackable' => false, 'scope' => 'order',
        ], $extra));
        Cache::flush();

        return $p;
    }

    /** @param list<array{item_id: int, quantity: int}> $items */
    private function tillOrder(string $type, array $items): Order
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $id = (int) $this->postJson('/api/orders', [
            'type' => $type, 'device_identifier' => $this->device->identifier, 'print' => false, 'items' => $items,
        ])->assertCreated()->json('order.id');

        return Order::findOrFail($id);
    }

    public function test_an_app_only_offer_shows_in_the_app_and_not_at_the_till(): void
    {
        $this->offer(['name' => 'App 10%', 'order_channels' => ['online']]);
        $lines = ['items' => [['item_id' => $this->curry->id, 'quantity' => 1, 'unit_price' => 60]], 'order_type' => 'online_pickup'];

        // The order app: a customer's sign-in (or none).
        Sanctum::actingAs(\App\Models\Customer::create(['name' => 'App', 'phone' => '+9607771111', 'is_active' => true]), ['customer']);
        $this->postJson('/api/promotions/auto-preview', $lines)->assertOk()
            ->assertJsonPath('discount_laar', 600)
            ->assertJsonPath('promotions.0.limit_label', 'App orders only');

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson('/api/promotions/auto-preview', $lines)->assertOk()->assertJsonPath('discount_laar', 0);
        $this->assertSame(0, (int) $this->tillOrder('takeaway', [['item_id' => $this->curry->id, 'quantity' => 1]])->promo_discount_laar);
    }

    public function test_a_dine_in_offer_waits_for_the_type_and_goes_on_dine_in_tickets_only(): void
    {
        $this->offer(['name' => 'Dine-in 10%', 'order_types' => ['dine_in']]);
        Sanctum::actingAs($this->staff, ['staff']);
        $line = ['item_id' => $this->curry->id, 'quantity' => 1, 'unit_price' => 60];

        $this->postJson('/api/promotions/auto-preview', ['items' => [$line]])->assertOk()->assertJsonPath('discount_laar', 0);
        $this->postJson('/api/promotions/auto-preview', ['items' => [$line], 'order_type' => 'takeaway'])->assertOk()->assertJsonPath('discount_laar', 0);
        $this->postJson('/api/promotions/auto-preview', ['items' => [$line], 'order_type' => 'dine_in'])->assertOk()
            ->assertJsonPath('discount_laar', 600)
            ->assertJsonPath('promotions.0.limit_label', 'Dine-in only');

        $this->assertSame(600, (int) $this->tillOrder('dine_in', [['item_id' => $this->curry->id, 'quantity' => 1]])->promo_discount_laar);
        $this->assertSame(0, (int) $this->tillOrder('takeaway', [['item_id' => $this->curry->id, 'quantity' => 1]])->promo_discount_laar);
    }

    public function test_switching_a_saved_ticket_type_drops_or_gains_the_offer(): void
    {
        $this->offer(['name' => 'Dine-in 10%', 'order_types' => ['dine_in']]);
        $order = $this->tillOrder('dine_in', [['item_id' => $this->curry->id, 'quantity' => 1]]);
        $this->assertSame(600, (int) $order->promo_discount_laar);

        $items = [['item_id' => $this->curry->id, 'name' => 'Chicken Curry', 'quantity' => 1]];
        $this->patchJson("/api/orders/{$order->id}/items", ['items' => $items, 'type' => 'takeaway'])->assertOk()
            ->assertJsonPath('order.promo_discount_laar', 0);
        $this->patchJson("/api/orders/{$order->id}/items", ['items' => $items, 'type' => 'dine_in'])->assertOk()
            ->assertJsonPath('order.promo_discount_laar', 600);
    }

    public function test_a_free_dish_for_dine_in_stays_out_of_the_menu_price(): void
    {
        $p = $this->offer(['name' => 'Free roshi dine-in', 'discount_value' => 100, 'scope' => 'item', 'order_types' => ['dine_in']]);
        $p->targets()->create(['target_type' => 'item', 'target_id' => $this->roshi->id, 'is_exclusion' => false]);
        Cache::flush();

        $pricing = app(AutoPromotionPricing::class);
        $pricing->bustCache();
        $this->assertNull($pricing->resolveForItem($this->roshi->id, 5.0, $this->roshi->fresh())['promotion'], 'not in the menu price');
        $this->assertSame(500, (int) $this->tillOrder('dine_in', [['item_id' => $this->roshi->id, 'quantity' => 1]])->promo_discount_laar);
        $this->assertSame(0, (int) $this->tillOrder('takeaway', [['item_id' => $this->roshi->id, 'quantity' => 1]])->promo_discount_laar);
    }

    public function test_a_free_roshi_for_each_curry_or_one_per_order(): void
    {
        $p = $this->offer(['name' => 'Roshi with curry', 'type' => 'free_item', 'discount_value' => 0, 'scope' => 'item', 'metadata' => ['free_per' => 'trigger']]);
        $p->targets()->create(['target_type' => 'item', 'target_id' => $this->curry->id, 'is_exclusion' => false, 'role' => PromotionTarget::ROLE_TRIGGER]);
        $p->targets()->create(['target_type' => 'item', 'target_id' => $this->roshi->id, 'is_exclusion' => false, 'role' => PromotionTarget::ROLE_REWARD]);
        $lines = ['items' => [
            ['item_id' => $this->curry->id, 'quantity' => 2, 'unit_price' => 60],
            ['item_id' => $this->roshi->id, 'quantity' => 3, 'unit_price' => 5],
        ]];

        $this->postJson('/api/promotions/auto-preview', $lines)->assertOk()->assertJsonPath('discount_laar', 1000);
        $this->postJson('/api/promotions/cart-rewards', $lines)->assertOk()
            ->assertJsonPath('rewards.0.free_count', 2)
            ->assertJsonPath('rewards.0.message', "You've earned 2 free Roshi — choose them.");

        $p->update(['metadata' => ['free_per' => 'order']]);
        $this->postJson('/api/promotions/auto-preview', $lines)->assertOk()->assertJsonPath('discount_laar', 500);
        $this->postJson('/api/promotions/cart-rewards', $lines)->assertOk()
            ->assertJsonPath('rewards.0.message', "You've earned a free Roshi — add it.");
    }

    public function test_admin_saves_which_orders_and_everything_ticked_means_every_order(): void
    {
        $this->actingAs($this->makeOwner());
        $base = ['name' => 'Lunch online', 'type' => 'percentage', 'discount_value' => 10, 'auto_apply' => true, 'scope' => 'order',
            'starts_at' => '2026-11-09 12:00:00', 'expires_at' => '2026-11-09 15:00:00'];

        $id = $this->postJson('/api/admin/promotions', $base + ['order_channels' => ['online'], 'order_types' => ['delivery', 'online_pickup']])
            ->assertCreated()->json('promotion.id') ?? Promotion::latest('id')->value('id');
        $p = Promotion::findOrFail($id);
        $this->assertSame(['online'], $p->order_channels);
        $this->assertSame(['online_pickup', 'delivery'], $p->order_types);
        $this->assertSame('App orders · pickup and delivery only', $p->orderLimitLabel());

        $this->patchJson("/api/admin/promotions/{$id}", ['order_channels' => ['till', 'online'], 'order_types' => []])->assertOk();
        $p->refresh();
        $this->assertNull($p->order_channels);
        $this->assertNull($p->order_types);
        $this->assertFalse($p->isLimitedToSomeOrders());

        $this->postJson('/api/admin/promotions', $base + ['order_types' => ['buffet']])->assertUnprocessable();
    }
}
