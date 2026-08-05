<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\SiteSetting;
use App\Services\OrderFulfilDateService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Tomorrow delivery orders bypass the daily delivery window / capacity
 * (driver arranged in advance) but still respect the owner accepting
 * kill-switch and the zone whitelist.
 */
class TomorrowDeliveryGateTest extends TestCase
{
    use RefreshDatabase;

    private Item $tomorrowItem;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $category = Category::create([
            'name' => 'TDG Cat',
            'slug' => 'tdg-cat',
            'is_active' => true,
        ]);

        $this->tomorrowItem = Item::create([
            'category_id' => $category->id,
            'name' => 'Tomorrow Cake',
            'base_price' => 50.0,
            'sku' => 'TDG-CAKE-001',
            'is_active' => true,
            'is_available' => true,
            'allow_pre_order' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'TDG Customer',
            'phone' => '+9607770200',
            'is_active' => true,
        ]);

        $this->setSetting('online_ordering_enabled', '1');
        $this->setSetting(OrderFulfilDateService::SETTING_KEY, '20:00');
        $this->setSetting('delivery_accepting_orders', '1');
        // Delivery window that excludes the frozen test time (15:00).
        $this->setSetting('delivery_schedule', json_encode([
            'tue' => [['open' => '18:00', 'close' => '22:00']],
        ]));

        Carbon::setTestNow(Carbon::parse('2026-08-04 15:00:00', config('app.timezone')));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function setSetting(string $key, ?string $value): void
    {
        SiteSetting::updateOrCreate(['key' => $key], [
            'value' => $value,
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => $key,
            'is_public' => true,
        ]);
        Cache::forget("site_setting.{$key}");
    }

    private function deliveryPayload(array $overrides = []): array
    {
        return array_merge([
            'items' => [['item_id' => $this->tomorrowItem->id, 'quantity' => 1]],
            'delivery_address_line1' => 'H. Test House',
            'delivery_island' => "Male'",
            'delivery_contact_name' => 'TDG Customer',
            'delivery_contact_phone' => '7770200',
        ], $overrides);
    }

    public function test_tomorrow_delivery_allowed_outside_delivery_window(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);

        // Sanity: same-day delivery is blocked by the schedule right now.
        $today = $this->postJson('/api/orders/delivery', $this->deliveryPayload());
        $today->assertStatus(422);

        $tomorrow = $this->postJson('/api/orders/delivery', $this->deliveryPayload([
            'collect_on' => 'tomorrow',
        ]));
        $tomorrow->assertCreated();
        $this->assertNotNull($tomorrow->json('order.fulfil_date'));
    }

    public function test_tomorrow_delivery_still_blocked_by_accepting_kill_switch(): void
    {
        $this->setSetting('delivery_accepting_orders', '0');
        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->postJson('/api/orders/delivery', $this->deliveryPayload([
            'collect_on' => 'tomorrow',
        ]));
        $res->assertStatus(422);
    }

    public function test_tomorrow_delivery_still_blocked_by_zone_whitelist(): void
    {
        $this->setSetting('delivery_zones', json_encode(['hulhumale']));
        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->postJson('/api/orders/delivery', $this->deliveryPayload([
            'collect_on' => 'tomorrow',
            'delivery_island' => "Male'",
        ]));
        $res->assertStatus(422);

        $inZone = $this->postJson('/api/orders/delivery', $this->deliveryPayload([
            'collect_on' => 'tomorrow',
            'delivery_island' => 'Hulhumale',
        ]));
        $inZone->assertCreated();
    }

    public function test_tomorrow_delivery_ignores_capacity_cap(): void
    {
        $this->setSetting('delivery_max_active_orders', '1');
        // Remove the schedule so the cap is the only thing that could block.
        $this->setSetting('delivery_schedule', null);
        Sanctum::actingAs($this->customer, ['customer']);

        $first = $this->postJson('/api/orders/delivery', $this->deliveryPayload());
        $first->assertCreated();

        // Same-day now at capacity…
        $second = $this->postJson('/api/orders/delivery', $this->deliveryPayload());
        $second->assertStatus(422);

        // …but tomorrow still goes through.
        $tomorrow = $this->postJson('/api/orders/delivery', $this->deliveryPayload([
            'collect_on' => 'tomorrow',
        ]));
        $tomorrow->assertCreated();
    }
}
