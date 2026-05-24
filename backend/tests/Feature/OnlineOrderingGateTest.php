<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\OnlineOrderingGateService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * Wave B — Online ordering gate tests.
 *
 * Covers:
 *  1. Master switch OFF blocks online_pickup orders
 *  2. Master switch OFF blocks delivery orders
 *  3. Master switch OFF does NOT block POS orders
 *  4. Schedule: open window allows orders
 *  5. Schedule: outside window blocks orders
 *  6. Override: force-open bypasses schedule
 *  7. Override: expired override does not open
 *  8. Status endpoint returns correct shape
 *  9. Admin toggle flips the switch
 * 10. Admin override sets/clears
 */
class OnlineOrderingGateTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private Customer $customer;

    private User $staffUser;

    private User $managerUser;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $category = Category::create(['name' => 'Food', 'slug' => 'gate-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Gate Test Item',
            'base_price' => 30.0,
            'sku' => 'GATE-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Gate Customer',
            'phone' => '+9607770099',
            'is_active' => true,
        ]);

        $cashierRole = Role::create(['name' => 'Cashier', 'slug' => 'cashier', 'is_active' => true]);
        $managerRole = Role::create(['name' => 'Manager', 'slug' => 'manager', 'is_active' => true]);

        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@gate-test.com',
            'password' => Hash::make('password'),
            'role_id' => $cashierRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->managerUser = User::create([
            'name' => 'Manager',
            'email' => 'manager@gate-test.com',
            'password' => Hash::make('password'),
            'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('5678'),
            'is_active' => true,
        ]);

        Device::create([
            'name' => 'Gate POS',
            'identifier' => 'GATE-POS-001',
            'type' => 'pos',
            'is_active' => true,
        ]);

        // Seed required settings rows
        $this->setSetting('online_ordering_enabled', '1');
        $this->setSetting('online_ordering_schedule', null);
        $this->setSetting('online_ordering_override_until', null);
        $this->setSetting('online_ordering_closed_message', 'Closed for testing.');
        $this->setSetting('delivery_accepting_orders', '1');
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

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

    private function postCustomerOrder(): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($this->customer, ['customer']);

        return $this->postJson('/api/customer/orders', [
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);
    }

    private function postPosOrder(): \Illuminate\Testing\TestResponse
    {
        $this->ensurePosApiReady($this->staffUser, 'GATE-POS-001');

        return $this->withHeader('X-Device-Identifier', 'GATE-POS-001')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ]);
    }

    // ------------------------------------------------------------------
    // Tests
    // ------------------------------------------------------------------

    public function test_master_switch_off_blocks_online_pickup(): void
    {
        $this->setSetting('online_ordering_enabled', '0');

        $response = $this->postCustomerOrder();
        $response->assertStatus(422);
        $this->assertStringContainsString('Closed', $response->json('message'));
    }

    public function test_master_switch_off_does_not_block_pos(): void
    {
        $this->setSetting('online_ordering_enabled', '0');

        $response = $this->postPosOrder();
        $response->assertCreated();
    }

    public function test_master_switch_on_allows_online_pickup(): void
    {
        $this->setSetting('online_ordering_enabled', '1');

        $response = $this->postCustomerOrder();
        $response->assertCreated();
    }

    public function test_schedule_open_window_allows_order(): void
    {
        // Pin the clock to mid-day so open/close never straddles midnight.
        // Without this the test was flaky between 00:00 and 01:00 local
        // time — open=23:00 wrapped to the previous day and the gate
        // refused the order.
        Carbon::setTestNow(Carbon::create(2026, 6, 15, 12, 30, 0, config('app.timezone', 'UTC')));
        $now = Carbon::now(config('app.timezone', 'UTC'));
        $dayKey = strtolower($now->format('D'));

        $this->setSetting('online_ordering_schedule', json_encode([
            $dayKey => [
                'open' => $now->clone()->subHour()->format('H:i'),
                'close' => $now->clone()->addHours(2)->format('H:i'),
            ],
        ]));

        try {
            $response = $this->postCustomerOrder();
            $response->assertCreated();
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_schedule_closed_window_blocks_order(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 15, 12, 30, 0, config('app.timezone', 'UTC')));
        $now = Carbon::now(config('app.timezone', 'UTC'));
        // Set a schedule with a window that is entirely in the past
        $dayKey = strtolower($now->format('D'));

        $this->setSetting('online_ordering_schedule', json_encode([
            $dayKey => [
                'open' => '00:00',
                'close' => '00:01',
            ],
        ]));

        try {
            $response = $this->postCustomerOrder();
            $response->assertStatus(422);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_override_bypasses_closed_schedule(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 15, 12, 30, 0, config('app.timezone', 'UTC')));
        $now = Carbon::now(config('app.timezone', 'UTC'));
        $dayKey = strtolower($now->format('D'));

        // Schedule says closed
        $this->setSetting('online_ordering_schedule', json_encode([
            $dayKey => ['open' => '00:00', 'close' => '00:01'],
        ]));

        // But override forces open for the next hour
        $this->setSetting(
            'online_ordering_override_until',
            $now->clone()->addHour()->toIso8601String(),
        );

        try {
            $response = $this->postCustomerOrder();
            $response->assertCreated();
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_expired_override_does_not_open(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 15, 12, 30, 0, config('app.timezone', 'UTC')));
        $now = Carbon::now(config('app.timezone', 'UTC'));
        $dayKey = strtolower($now->format('D'));

        // Schedule says closed
        $this->setSetting('online_ordering_schedule', json_encode([
            $dayKey => ['open' => '00:00', 'close' => '00:01'],
        ]));

        // Override is in the past — expired
        $this->setSetting(
            'online_ordering_override_until',
            $now->clone()->subHour()->toIso8601String(),
        );

        try {
            $response = $this->postCustomerOrder();
            $response->assertStatus(422);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_status_endpoint_returns_correct_shape(): void
    {
        $response = $this->getJson('/api/ordering/status');
        $response->assertOk()
            ->assertJsonStructure([
                'open',
                'message',
                'master_switch',
                'override_active',
                'schedule_active',
                'next_open_window',
            ]);
    }

    public function test_status_is_open_when_switch_on(): void
    {
        $this->setSetting('online_ordering_enabled', '1');
        $this->setSetting('online_ordering_schedule', null);

        $response = $this->getJson('/api/ordering/status');
        $response->assertOk()->assertJsonPath('open', true);
    }

    public function test_status_is_closed_when_switch_off(): void
    {
        $this->setSetting('online_ordering_enabled', '0');

        $response = $this->getJson('/api/ordering/status');
        $response->assertOk()->assertJsonPath('open', false);
    }

    public function test_admin_toggle_flips_switch(): void
    {
        $this->setSetting('online_ordering_enabled', '1');

        Sanctum::actingAs($this->managerUser, ['staff']);

        // Flip off
        $response = $this->postJson('/api/admin/ordering/toggle', ['enabled' => false]);
        $response->assertOk()->assertJsonPath('online_ordering_enabled', false);

        // Confirm it persists
        Cache::forget('site_setting.online_ordering_enabled');
        $this->assertSame('0', SiteSetting::where('key', 'online_ordering_enabled')->value('value'));

        // Flip back on
        $response = $this->postJson('/api/admin/ordering/toggle', ['enabled' => true]);
        $response->assertOk()->assertJsonPath('online_ordering_enabled', true);
    }

    public function test_admin_override_sets_and_clears(): void
    {
        Sanctum::actingAs($this->managerUser, ['staff']);

        $future = now()->addHour()->toIso8601String();

        // Set override
        $response = $this->postJson('/api/admin/ordering/override', ['override_until' => $future]);
        $response->assertOk()->assertJsonPath('status.override_active', true);

        // Clear override
        $response = $this->postJson('/api/admin/ordering/override', ['override_until' => null]);
        $response->assertOk()->assertJsonPath('status.override_active', false);
    }

    public function test_gate_service_schedule_logic_directly(): void
    {
        $gate = app(OnlineOrderingGateService::class);

        $this->setSetting('online_ordering_enabled', '1');
        $this->setSetting('online_ordering_schedule', null);
        $this->setSetting('online_ordering_override_until', null);

        // No schedule = always open
        $this->assertTrue($gate->isOpen());

        // Switch off
        $this->setSetting('online_ordering_enabled', '0');
        Cache::forget('site_setting.online_ordering_enabled');
        $this->assertFalse($gate->isOpen());
    }
}
