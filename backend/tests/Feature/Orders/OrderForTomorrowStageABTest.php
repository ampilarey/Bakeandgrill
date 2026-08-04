<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\OrderFulfilDateService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Group 1 — Stages A + B: admin can tick allow_pre_order; orders carry fulfil_date.
 */
class OrderForTomorrowStageABTest extends TestCase
{
    use RefreshDatabase;

    private Item $tomorrowItem;

    private Item $todayOnlyItem;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $category = Category::create([
            'name' => 'Tomorrow Cat',
            'slug' => 'tomorrow-cat',
            'is_active' => true,
        ]);

        $this->tomorrowItem = Item::create([
            'category_id' => $category->id,
            'name' => 'Tomorrow Bread',
            'base_price' => 25.0,
            'sku' => 'TMW-BREAD-001',
            'is_active' => true,
            'is_available' => true,
            'allow_pre_order' => true,
        ]);

        $this->todayOnlyItem = Item::create([
            'category_id' => $category->id,
            'name' => 'Today Only Cake',
            'base_price' => 30.0,
            'sku' => 'TODAY-CAKE-001',
            'is_active' => true,
            'is_available' => true,
            'allow_pre_order' => false,
        ]);

        $this->customer = Customer::create([
            'name' => 'Tomorrow Customer',
            'phone' => '+9607770099',
            'is_active' => true,
        ]);

        SiteSetting::updateOrCreate(['key' => 'online_ordering_enabled'], [
            'value' => '1',
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'online_ordering_enabled',
            'is_public' => true,
        ]);
        SiteSetting::updateOrCreate(['key' => OrderFulfilDateService::SETTING_KEY], [
            'value' => '20:00',
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'order_for_tomorrow_cutoff',
            'is_public' => true,
        ]);
    }

    public function test_admin_can_set_allow_pre_order_on_item(): void
    {
        $ownerRole = \App\Models\Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        $owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-tomorrow@test.com',
            'password' => bcrypt('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => bcrypt('9999'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $res = $this->patchJson('/api/items/' . $this->todayOnlyItem->id, [
            'allow_pre_order' => true,
        ]);

        $res->assertOk();
        $this->assertTrue((bool) $this->todayOnlyItem->fresh()->allow_pre_order);
    }

    public function test_public_items_expose_allow_pre_order(): void
    {
        $res = $this->getJson('/api/items');
        $res->assertOk();
        $row = collect($res->json('items') ?? $res->json('data') ?? [])
            ->firstWhere('id', $this->tomorrowItem->id);
        $this->assertNotNull($row, 'Tomorrow item missing from /api/items');
        $this->assertTrue((bool) ($row['allow_pre_order'] ?? false));
    }

    public function test_customer_order_persists_server_resolved_fulfil_date(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-04 15:00:00', config('app.timezone')));
        Sanctum::actingAs($this->customer, ['customer']);

        $allowed = app(OrderFulfilDateService::class)->allowedTomorrowDateString();

        $res = $this->postJson('/api/customer/orders', [
            'type' => 'online_pickup',
            'collect_on' => 'tomorrow',
            'items' => [
                ['item_id' => $this->tomorrowItem->id, 'quantity' => 1],
            ],
        ]);

        $res->assertCreated();
        $order = Order::findOrFail($res->json('order.id'));
        $this->assertSame($allowed, $order->fulfil_date?->toDateString());
        $this->assertNull($order->fired_at);
    }

    public function test_browser_supplied_wrong_fulfil_date_is_rejected(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-04 15:00:00', config('app.timezone')));
        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->postJson('/api/customer/orders', [
            'type' => 'online_pickup',
            'fulfil_date' => '2099-01-01',
            'items' => [
                ['item_id' => $this->tomorrowItem->id, 'quantity' => 1],
            ],
        ]);

        $res->assertStatus(422);
        $this->assertSame(0, Order::count());
    }

    public function test_after_cutoff_tomorrow_rolls_to_day_after(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-04 20:00:00', config('app.timezone')));
        $svc = app(OrderFulfilDateService::class);
        $this->assertSame('2026-08-06', $svc->allowedTomorrowDateString());

        Carbon::setTestNow(Carbon::parse('2026-08-04 19:59:00', config('app.timezone')));
        $this->assertSame('2026-08-05', $svc->allowedTomorrowDateString());
    }

    public function test_item_without_allow_pre_order_cannot_be_ordered_for_tomorrow(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-04 15:00:00', config('app.timezone')));
        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->postJson('/api/customer/orders', [
            'type' => 'online_pickup',
            'collect_on' => 'tomorrow',
            'items' => [
                ['item_id' => $this->todayOnlyItem->id, 'quantity' => 1],
            ],
        ]);

        $res->assertStatus(422);
        $this->assertSame(0, Order::count());
    }

    public function test_ordering_status_includes_order_for_tomorrow_fragment(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-04 15:00:00', config('app.timezone')));

        $res = $this->getJson('/api/ordering/status');
        $res->assertOk();
        $res->assertJsonPath('order_for_tomorrow.cutoff', '20:00');
        $res->assertJsonPath('order_for_tomorrow.collect_tomorrow_date', '2026-08-05');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }
}
