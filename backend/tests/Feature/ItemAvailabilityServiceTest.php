<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\SiteSetting;
use App\Services\ItemAvailabilityService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * Wave C — ItemAvailabilityService tests.
 *
 * Verifies the unified availability pipeline returns correct results
 * and that the public items API includes the availability field.
 */
class ItemAvailabilityServiceTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    private string $channel = 'online_pickup';

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $cat = Category::create(['name' => 'Avail Test', 'slug' => 'avail-test', 'is_active' => true]);

        $this->item = Item::create([
            'category_id' => $cat->id,
            'name' => 'Availability Item',
            'base_price' => 25.0,
            'sku' => 'AVAIL-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->setSetting('online_ordering_enabled', '1');
        $this->setSetting('online_ordering_schedule', null);
        $this->setSetting('online_ordering_override_until', null);
    }

    private function setSetting(string $key, ?string $value): void
    {
        SiteSetting::updateOrCreate(['key' => $key], [
            'value' => $value, 'type' => 'text', 'group' => 'Test', 'label' => $key, 'is_public' => true,
        ]);
        Cache::forget("site_setting.{$key}");
    }

    private function service(): ItemAvailabilityService
    {
        return app(ItemAvailabilityService::class);
    }

    public function test_available_item_returns_allowed(): void
    {
        $result = $this->service()->check($this->item, $this->channel);
        $this->assertTrue($result->allowed);
        $this->assertNull($result->reasonCode);
    }

    public function test_inactive_item_returns_unavailable(): void
    {
        $this->item->update(['is_active' => false]);
        $result = $this->service()->check($this->item, $this->channel);
        $this->assertFalse($result->allowed);
        $this->assertSame('item_inactive', $result->reasonCode);
    }

    public function test_unavailable_item_flag_returns_unavailable(): void
    {
        $this->item->update(['is_available' => false]);
        $result = $this->service()->check($this->item, $this->channel);
        $this->assertFalse($result->allowed);
        $this->assertSame('item_unavailable', $result->reasonCode);
    }

    public function test_ordering_closed_returns_correct_reason(): void
    {
        $this->setSetting('online_ordering_enabled', '0');
        $this->setSetting('online_ordering_closed_message', 'Kitchen closed.');
        Cache::forget('site_setting.online_ordering_enabled');
        Cache::forget('site_setting.online_ordering_closed_message');

        $result = $this->service()->check($this->item, 'online_pickup');
        $this->assertFalse($result->allowed);
        $this->assertSame('ordering_closed', $result->reasonCode);
        $this->assertSame('Kitchen closed.', $result->message);
    }

    public function test_out_of_stock_prepared_item_returns_correct_reason(): void
    {
        $cat = Category::create(['name' => 'Stock Cat', 'slug' => 'sc-avail', 'is_active' => true]);
        $stockItem = Item::create([
            'category_id' => $cat->id,
            'name' => 'Stock Item',
            'base_price' => 20.0,
            'sku' => 'STOCK-AVAIL-001',
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 0,
        ]);

        $result = $this->service()->check($stockItem, 'online_pickup');
        $this->assertFalse($result->allowed);
        $this->assertSame('out_of_stock', $result->reasonCode);
    }

    public function test_ordering_closed_does_not_affect_pos_channel(): void
    {
        $this->setSetting('online_ordering_enabled', '0');
        Cache::forget('site_setting.online_ordering_enabled');

        // dine_in is a POS channel — gate should not apply
        $result = $this->service()->check($this->item, 'dine_in');
        $this->assertNotSame('ordering_closed', $result->reasonCode);
    }

    public function test_public_items_api_includes_availability_field(): void
    {
        $response = $this->getJson('/api/items?channel=online_pickup');
        $response->assertOk();

        $items = $response->json('data');
        $this->assertNotEmpty($items);

        $first = $items[0];
        $this->assertArrayHasKey('availability', $first);
        $this->assertArrayHasKey('available', $first['availability']);
        $this->assertArrayHasKey('reason_code', $first['availability']);
        $this->assertArrayHasKey('available_from', $first['availability']);
        $this->assertArrayHasKey('available_now', $first);
        $this->assertTrue($first['available_now']);
        $this->assertNull($first['unavailable_reason']);
        $this->assertNull($first['available_from']);
    }

    public function test_public_item_show_includes_wave_c_aliases(): void
    {
        $response = $this->getJson('/api/items/'.$this->item->id.'?channel=online_pickup');
        $response->assertOk();

        $item = $response->json('item');
        $this->assertTrue($item['available_now']);
        $this->assertNull($item['unavailable_reason']);
        $this->assertArrayHasKey('availability', $item);
        $this->assertTrue($item['availability']['available']);
    }

    public function test_future_channel_valid_from_sets_available_from(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 15, 12, 0, 0, config('app.timezone', 'UTC')));
        $from = Carbon::create(2026, 6, 16, 10, 0, 0, config('app.timezone', 'UTC'));

        try {
            ItemChannelAvailability::query()
                ->where('item_id', $this->item->id)
                ->where('channel', 'online_pickup')
                ->update(['valid_from' => $from, 'is_enabled' => true]);

            $result = $this->service()->check($this->item->fresh(), 'online_pickup');
            $this->assertFalse($result->allowed);
            $this->assertSame('channel_unavailable', $result->reasonCode);
            $this->assertNotNull($result->availableFrom);
            $this->assertTrue(Carbon::parse($result->availableFrom)->equalTo($from));

            $response = $this->getJson('/api/items?channel=online_pickup');
            $response->assertOk();
            // Item may be filtered from list by scopeItemsForChannel — check show when visible
            // or assert via service payload shape through annotate.
            $payload = $this->service()->withPublicAliases([], $result);
            $this->assertFalse($payload['available_now']);
            $this->assertSame('channel_unavailable', $payload['unavailable_reason']);
            $this->assertNotNull($payload['available_from']);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_ordering_closed_with_schedule_sets_available_from(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 15, 12, 30, 0, config('app.timezone', 'UTC')));
        $dayKey = 'mon'; // 2026-06-15 is Monday

        try {
            $this->setSetting('online_ordering_enabled', '1');
            $this->setSetting('online_ordering_schedule', json_encode([
                $dayKey => ['open' => '18:00', 'close' => '22:00'],
            ]));

            $result = $this->service()->check($this->item, 'online_pickup');
            $this->assertFalse($result->allowed);
            $this->assertSame('ordering_closed', $result->reasonCode);
            $this->assertNotNull($result->availableFrom);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_admin_items_api_does_not_include_availability_field(): void
    {
        // Admin role
        $role = \App\Models\Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'slug' => 'owner', 'is_active' => true]);
        $user = \App\Models\User::create([
            'name' => 'Owner', 'email' => 'owner@test.com',
            'password' => \Illuminate\Support\Facades\Hash::make('pw'),
            'role_id' => $role->id, 'pin_hash' => \Illuminate\Support\Facades\Hash::make('1234'), 'is_active' => true,
        ]);
        \Laravel\Sanctum\Sanctum::actingAs($user, ['staff']);

        $response = $this->getJson('/api/items');
        $response->assertOk();

        $items = $response->json('data');
        if (!empty($items)) {
            $this->assertArrayNotHasKey('availability', $items[0]);
        }
    }
}
