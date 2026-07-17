<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\SiteSetting;
use App\Services\DeliveryGateService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Wave E — Delivery hours + zone enforcement tests.
 *
 *  1. Accepting flag off  → blocked
 *  2. Schedule closed     → blocked
 *  3. Schedule open       → allowed
 *  4. Zone enforced, wrong zone → blocked
 *  5. Zone enforced, correct zone → allowed
 *  6. No zones configured → any zone allowed
 *  7. Status endpoint structure
 *  8. Status endpoint zone-check
 */
class DeliveryGateTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $cat = Category::create(['name' => 'Delivery Food', 'slug' => 'del-food', 'is_active' => true]);

        $this->item = Item::create([
            'category_id' => $cat->id,
            'name' => 'Delivery Item',
            'base_price' => 40.0,
            'sku' => 'DEL-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Delivery Customer',
            'phone' => '+9607770099',
            'is_active' => true,
        ]);

        // Online ordering gate must be open so delivery gate is the only variable
        $this->setSetting('online_ordering_enabled', '1');
        $this->setSetting('online_ordering_schedule', null);
        $this->setSetting('online_ordering_override_until', null);
        $this->setSetting('online_ordering_closed_message', 'Closed');
        $this->setSetting('delivery_accepting_orders', '1');
        $this->setSetting('delivery_schedule', null);
        $this->setSetting('delivery_zones', null);
        $this->setSetting('delivery_max_active_orders', '0');
        $this->setSetting('delivery_override_until', null);
    }

    private function setSetting(string $key, ?string $value): void
    {
        SiteSetting::updateOrCreate(['key' => $key], [
            'value' => $value, 'type' => 'text', 'group' => 'Test', 'label' => $key, 'is_public' => true,
        ]);
        Cache::forget("site_setting.{$key}");
    }

    private function gate(): DeliveryGateService
    {
        return app(DeliveryGateService::class);
    }

    private function postDeliveryOrder(string $island = 'male'): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($this->customer, ['customer']);

        return $this->postJson('/api/orders/delivery', [
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            'delivery_address_line1' => '1st Floor, Kalaafaanu Hingun',
            'delivery_island' => $island,
            'delivery_contact_name' => 'Test',
            'delivery_contact_phone' => '9607777777',
        ]);
    }

    public function test_accepting_flag_off_blocks_delivery(): void
    {
        $this->setSetting('delivery_accepting_orders', '0');

        $response = $this->postDeliveryOrder();
        $response->assertStatus(422);
    }

    public function test_schedule_closed_window_blocks_delivery(): void
    {
        // Same midnight-wraparound concern as the open-window test —
        // pin the clock so the choice of dayKey is deterministic.
        Carbon::setTestNow(Carbon::create(2026, 6, 15, 12, 30, 0, config('app.timezone', 'UTC')));
        $now = Carbon::now(config('app.timezone', 'UTC'));
        $dayKey = strtolower($now->format('D'));

        $this->setSetting('delivery_schedule', json_encode([
            $dayKey => ['open' => '00:00', 'close' => '00:01'],
        ]));

        try {
            $response = $this->postDeliveryOrder();
            $response->assertStatus(422);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_schedule_open_window_allows_delivery(): void
    {
        // Pin "now" to mid-day so the open/close window never wraps
        // around midnight. The previous test computed
        // open=now-1h / close=now+2h dynamically, which failed
        // whenever the suite happened to run between 00:00 and 01:00
        // local time — the open time wrapped to 23:00 yesterday and
        // the gate's string-compare logic refused the order.
        Carbon::setTestNow(Carbon::create(2026, 6, 15, 12, 30, 0, config('app.timezone', 'UTC')));
        $now = Carbon::now(config('app.timezone', 'UTC'));
        $dayKey = strtolower($now->format('D'));

        $this->setSetting('delivery_schedule', json_encode([
            $dayKey => [
                'open' => $now->clone()->subHour()->format('H:i'),
                'close' => $now->clone()->addHours(2)->format('H:i'),
            ],
        ]));

        try {
            $response = $this->postDeliveryOrder();
            $response->assertCreated();
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_zone_enforcement_blocks_wrong_zone(): void
    {
        $this->setSetting('delivery_zones', json_encode(['male', 'hulhumale']));

        $response = $this->postDeliveryOrder('addu');
        $response->assertStatus(422);
        $this->assertStringContainsString('addu', $response->json('message'));
    }

    public function test_zone_enforcement_allows_correct_zone(): void
    {
        $this->setSetting('delivery_zones', json_encode(['male', 'hulhumale']));

        $response = $this->postDeliveryOrder('male');
        $response->assertCreated();
    }

    public function test_no_zones_configured_accepts_any_zone(): void
    {
        $this->setSetting('delivery_zones', null);

        $response = $this->postDeliveryOrder('any-random-island');
        // Will fail at OrderCreationService level (minimum order, etc) or succeed,
        // but the gate itself must not block it
        $this->assertNotSame(422, $response->getStatusCode(), 'Gate must not block when zones not configured');
    }

    public function test_delivery_status_endpoint_shape(): void
    {
        $response = $this->getJson('/api/ordering/delivery-status');
        $response->assertOk()->assertJsonStructure([
            'delivery_open',
            'accepting',
            'zone_eligible',
            'message',
            'accepting_flag',
            'schedule_active',
            'zones_enforced',
            'next_delivery_window',
            'max_active_orders',
            'active_delivery_orders',
            'capacity_enforced',
        ]);
    }

    public function test_delivery_status_endpoint_zone_check(): void
    {
        $this->setSetting('delivery_zones', json_encode(['male']));

        $open = $this->getJson('/api/ordering/delivery-status?area=male');
        $closed = $this->getJson('/api/ordering/delivery-status?area=hulhumale');

        $open->assertOk()
            ->assertJsonPath('delivery_open', true)
            ->assertJsonPath('zone_eligible', true)
            ->assertJsonPath('accepting', true);
        $closed->assertOk()
            ->assertJsonPath('delivery_open', false)
            ->assertJsonPath('zone_eligible', false)
            ->assertJsonPath('reason', 'zone');
    }

    public function test_capacity_blocks_when_at_max_active_orders(): void
    {
        $this->setSetting('delivery_max_active_orders', '1');

        Order::create([
            'order_number' => 'DEL-CAP-1',
            'type' => 'delivery',
            'status' => 'preparing',
            'payment_status' => 'paid',
            'customer_id' => $this->customer->id,
            'subtotal' => 40,
            'total' => 40,
        ]);

        $response = $this->postDeliveryOrder();
        $response->assertStatus(422);
        $this->assertStringContainsString('capacity', strtolower($response->json('message')));
    }

    public function test_capacity_allows_when_under_max(): void
    {
        $this->setSetting('delivery_max_active_orders', '2');

        Order::create([
            'order_number' => 'DEL-CAP-2',
            'type' => 'delivery',
            'status' => 'preparing',
            'payment_status' => 'paid',
            'customer_id' => $this->customer->id,
            'subtotal' => 40,
            'total' => 40,
        ]);

        $response = $this->postDeliveryOrder();
        $response->assertCreated();
    }

    public function test_override_bypasses_capacity(): void
    {
        $this->setSetting('delivery_max_active_orders', '1');
        $this->setSetting(
            'delivery_override_until',
            now()->addHour()->toIso8601String(),
        );

        Order::create([
            'order_number' => 'DEL-CAP-OV',
            'type' => 'delivery',
            'status' => 'preparing',
            'payment_status' => 'paid',
            'customer_id' => $this->customer->id,
            'subtotal' => 40,
            'total' => 40,
        ]);

        $response = $this->postDeliveryOrder();
        $response->assertCreated();
    }

    public function test_service_schedule_and_zone_logic_directly(): void
    {
        $gate = $this->gate();

        // All open, no schedule, no zones
        $this->assertTrue($gate->isDeliveryOpen('male'));

        // Zones configured, wrong zone
        $this->setSetting('delivery_zones', json_encode(['male']));
        Cache::forget('site_setting.delivery_zones');
        $this->assertFalse($gate->isDeliveryOpen('hulhumale'));
        $this->assertTrue($gate->isDeliveryOpen('male'));
    }
}
