<?php

declare(strict_types=1);

namespace Tests\Feature\Ordering;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\ReservationSetting;
use App\Models\RestaurantTable;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\FeatureGateService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Kill switch + per-day schedule + force-open override for every online
 * ordering feature: order-for-tomorrow, dine-in pre-order, reservations,
 * gift card purchase.
 */
class FeatureGatesTest extends TestCase
{
    use RefreshDatabase;

    private Item $tomorrowItem;

    private Customer $customer;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        // Tuesday 15:00 local.
        Carbon::setTestNow(Carbon::parse('2026-08-04 15:00:00', config('app.timezone')));

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Gate Cat', 'slug' => 'gate-cat', 'is_active' => true]);

        $this->tomorrowItem = Item::create([
            'category_id' => $category->id,
            'name' => 'Gate Bread',
            'base_price' => 20.0,
            'sku' => 'GATE-BREAD-001',
            'is_active' => true,
            'is_available' => true,
            'allow_pre_order' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Gate Customer',
            'phone' => '+9607770500',
            'is_active' => true,
        ]);

        $ownerRole = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        $this->owner = User::create([
            'name' => 'Gate Owner',
            'email' => 'gate-owner@test.com',
            'password' => bcrypt('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => bcrypt('9999'),
            'is_active' => true,
        ]);

        RestaurantTable::create(['name' => 'G1', 'capacity' => 4, 'status' => 'available', 'is_active' => true]);
        ReservationSetting::current();

        foreach ([
            'online_ordering_enabled' => '1',
            'pickup_slots_enabled' => '0',
            'dine_in_preorder_enabled' => '1',
        ] as $key => $value) {
            SiteSetting::set($key, $value);
        }
        SiteSetting::bust();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ── Order for tomorrow ─────────────────────────────────────────────────────

    public function test_tomorrow_kill_switch_blocks_new_tomorrow_orders(): void
    {
        SiteSetting::set('order_for_tomorrow_enabled', '0');

        Sanctum::actingAs($this->customer, ['customer']);
        $res = $this->postJson('/api/customer/orders', [
            'collect_on' => 'tomorrow',
            'items' => [['item_id' => $this->tomorrowItem->id, 'quantity' => 1]],
        ]);

        $res->assertStatus(422);
        $this->assertStringContainsString('switched off', json_encode($res->json()));
        $this->assertSame(0, Order::count());

        // Same-day ordering is unaffected.
        $today = $this->postJson('/api/customer/orders', [
            'items' => [['item_id' => $this->tomorrowItem->id, 'quantity' => 1]],
        ]);
        $today->assertCreated();
    }

    public function test_tomorrow_schedule_window_applies(): void
    {
        // Tue window 18:00-20:00; now is 15:00 → closed.
        SiteSetting::set('order_for_tomorrow_schedule', json_encode([
            'tue' => ['open' => '18:00', 'close' => '20:00', 'enabled' => true],
        ]));

        Sanctum::actingAs($this->customer, ['customer']);
        $this->postJson('/api/customer/orders', [
            'collect_on' => 'tomorrow',
            'items' => [['item_id' => $this->tomorrowItem->id, 'quantity' => 1]],
        ])->assertStatus(422);

        // Inside the window it works again.
        Carbon::setTestNow(Carbon::parse('2026-08-04 19:00:00', config('app.timezone')));
        $this->postJson('/api/customer/orders', [
            'collect_on' => 'tomorrow',
            'items' => [['item_id' => $this->tomorrowItem->id, 'quantity' => 1]],
        ])->assertCreated();
    }

    public function test_tomorrow_override_forces_open(): void
    {
        SiteSetting::set('order_for_tomorrow_enabled', '0');
        SiteSetting::set('order_for_tomorrow_override_until', now()->addHour()->toIso8601String());

        Sanctum::actingAs($this->customer, ['customer']);
        $this->postJson('/api/customer/orders', [
            'collect_on' => 'tomorrow',
            'items' => [['item_id' => $this->tomorrowItem->id, 'quantity' => 1]],
        ])->assertCreated();
    }

    // ── Dine-in pre-order ──────────────────────────────────────────────────────

    public function test_dine_in_schedule_window_applies(): void
    {
        SiteSetting::set('dine_in_preorder_schedule', json_encode([
            'tue' => ['open' => '11:00', 'close' => '14:00', 'enabled' => true],
        ]));

        Sanctum::actingAs($this->customer, ['customer']);
        $payload = [
            'type' => 'dine_in',
            'party_size' => 2,
            'pickup_slot_at' => now()->addHours(2)->toIso8601String(),
            'items' => [['item_id' => $this->tomorrowItem->id, 'quantity' => 1]],
        ];

        // 15:00 — outside the 11:00-14:00 window.
        $this->postJson('/api/customer/orders', $payload)->assertStatus(422);

        Carbon::setTestNow(Carbon::parse('2026-08-04 12:00:00', config('app.timezone')));
        $payload['pickup_slot_at'] = now()->addHours(2)->toIso8601String();
        $this->postJson('/api/customer/orders', $payload)->assertCreated();
    }

    // ── Reservations ───────────────────────────────────────────────────────────

    public function test_reservations_kill_switch_blocks_new_bookings(): void
    {
        SiteSetting::set('reservations_enabled', '0');

        $this->postJson('/api/reservations', [
            'customer_name' => 'Blocked Guest',
            'customer_phone' => '+9607770511',
            'party_size' => 2,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '19:00',
        ])->assertStatus(422);

        $availability = $this->getJson(
            '/api/reservations/availability?date=' . now()->addDay()->toDateString() . '&party_size=2',
        );
        $availability->assertOk();
        $availability->assertJsonPath('meta.accepting', false);
        $this->assertSame([], $availability->json('slots'));
    }

    public function test_reservations_accept_when_gate_open(): void
    {
        $this->postJson('/api/reservations', [
            'customer_name' => 'Welcome Guest',
            'customer_phone' => '+9607770512',
            'party_size' => 2,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '19:00',
        ])->assertCreated();
    }

    // ── Gift cards ─────────────────────────────────────────────────────────────

    public function test_gift_card_purchase_kill_switch(): void
    {
        SiteSetting::set('gift_card_purchase_enabled', '0');

        Sanctum::actingAs($this->customer, ['customer']);
        $res = $this->postJson('/api/gift-cards/purchase', [
            'amount' => 100,
        ]);

        $res->assertStatus(422);
        $this->assertStringContainsString('unavailable', (string) $res->json('message'));
    }

    // ── Admin API ──────────────────────────────────────────────────────────────

    public function test_admin_can_list_and_update_gates(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $list = $this->getJson('/api/admin/ordering/feature-gates');
        $list->assertOk();
        $list->assertJsonPath('gates.order_for_tomorrow.enabled', true);
        $list->assertJsonPath('gates.reservations.enabled', true);
        $list->assertJsonPath('gates.gift_card_purchase.enabled', true);

        $update = $this->putJson('/api/admin/ordering/feature-gates/order_for_tomorrow', [
            'enabled' => false,
        ]);
        $update->assertOk();
        $update->assertJsonPath('gate.enabled', false);
        $update->assertJsonPath('gate.open', false);

        $schedule = $this->putJson('/api/admin/ordering/feature-gates/dine_in_preorder', [
            'schedule' => ['tue' => ['open' => '11:00', 'close' => '14:00', 'enabled' => true]],
        ]);
        $schedule->assertOk();
        $schedule->assertJsonPath('gate.open', false); // 15:00, outside window

        $this->putJson('/api/admin/ordering/feature-gates/nonsense', ['enabled' => false])
            ->assertStatus(404);
    }

    public function test_public_status_exposes_gate_flags(): void
    {
        SiteSetting::set('order_for_tomorrow_enabled', '0');
        SiteSetting::set('gift_card_purchase_enabled', '0');

        $res = $this->getJson('/api/ordering/status');
        $res->assertOk();
        $res->assertJsonPath('order_for_tomorrow.enabled', false);
        $res->assertJsonPath('order_for_tomorrow.open', false);
        $res->assertJsonPath('dine_in_preorder.open', true);
        $res->assertJsonPath('reservations.open', true);
        $res->assertJsonPath('gift_cards.open', false);
    }

    public function test_service_layer_defaults_preserve_behaviour(): void
    {
        $gates = app(FeatureGateService::class);
        $this->assertTrue($gates->open('order_for_tomorrow'));
        $this->assertTrue($gates->open('reservations'));
        $this->assertTrue($gates->open('gift_card_purchase'));
        $this->assertTrue($gates->open('dine_in_preorder')); // enabled in setUp
    }
}
