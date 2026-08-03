<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Services\ItemAvailabilityService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ItemStockVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private function enableChannels(Item $item): void
    {
        foreach (KitchenMenuResolver::ORDERING_CHANNELS as $channel) {
            ItemChannelAvailability::query()->updateOrCreate(
                ['item_id' => $item->id, 'channel' => $channel],
                ['is_enabled' => true],
            );
        }
    }

    private function stockItem(array $overrides = []): Item
    {
        $cat = Category::query()->first() ?? Category::create([
            'name' => 'Cakes',
            'slug' => 'cakes-stock-vis',
            'is_active' => true,
        ]);

        $item = Item::factory()->create(array_merge([
            'category_id' => $cat->id,
            'is_available' => true,
            'is_active' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 5,
            'low_stock_threshold' => 5,
        ], $overrides));
        $this->enableChannels($item);

        return $item->fresh();
    }

    public function test_sold_out_item_appears_on_public_menu_as_unavailable(): void
    {
        $item = $this->stockItem(['stock_quantity' => 0]);

        $res = $this->getJson('/api/items?channel=online_pickup');
        $res->assertOk();
        $row = collect($res->json('data'))->firstWhere('id', $item->id);
        $this->assertNotNull($row);
        $this->assertFalse($row['available_now']);
        $this->assertSame('out_of_stock', $row['unavailable_reason']);
        $this->assertFalse($row['is_low_stock']);
        $this->assertNull($row['low_stock_threshold']);
    }

    public function test_snoozed_item_appears_without_available_only_filter(): void
    {
        $item = Item::factory()->create(['is_available' => true, 'is_active' => true]);
        $this->enableChannels($item);
        $item->update(['snoozed_until' => now()->endOfDay()]);

        $withFilter = collect($this->getJson('/api/items?channel=online_pickup&available_only=1')->json('data'))->pluck('id');
        $this->assertFalse($withFilter->contains($item->id));

        $row = collect($this->getJson('/api/items?channel=online_pickup')->json('data'))->firstWhere('id', $item->id);
        $this->assertNotNull($row);
        $this->assertFalse($row['available_now']);
        $this->assertSame('snoozed', $row['unavailable_reason']);
    }

    public function test_inactive_item_stays_off_public_menu(): void
    {
        $item = Item::factory()->create(['is_available' => true, 'is_active' => false]);
        $this->enableChannels($item);

        $ids = collect($this->getJson('/api/items?channel=online_pickup')->json('data'))->pluck('id');
        $this->assertFalse($ids->contains($item->id));
    }

    public function test_is_low_stock_respects_threshold_without_exposing_it(): void
    {
        $low = $this->stockItem(['stock_quantity' => 3, 'low_stock_threshold' => 5]);
        $ok = $this->stockItem(['stock_quantity' => 8, 'low_stock_threshold' => 5, 'sku' => 'STOCK-OK']);

        $data = collect($this->getJson('/api/items?channel=online_pickup')->json('data'));
        $lowRow = $data->firstWhere('id', $low->id);
        $okRow = $data->firstWhere('id', $ok->id);

        $this->assertTrue($lowRow['is_low_stock']);
        $this->assertTrue($lowRow['available_now']);
        $this->assertSame(3, $lowRow['availability']['available_stock']);
        $this->assertNull($lowRow['low_stock_threshold']);

        $this->assertFalse($okRow['is_low_stock']);
        $this->assertNull($okRow['low_stock_threshold']);
    }

    public function test_untracked_item_never_low_stock(): void
    {
        $item = Item::factory()->create([
            'is_available' => true,
            'is_active' => true,
            'track_stock' => false,
            'availability_type' => 'always',
        ]);
        $this->enableChannels($item);

        $service = app(ItemAvailabilityService::class);
        $result = $service->check($item, 'online_pickup');
        $payload = $service->withPublicAliases([], $result, $item);
        $this->assertFalse($payload['is_low_stock']);
        $this->assertNull($payload['availability']['available_stock']);
    }

    public function test_snooze_durations_and_optional_reason_note(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-03 10:00:00', config('app.timezone')));
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = Item::factory()->create(['is_available' => true, 'is_active' => true]);
        $this->enableChannels($item);

        $this->patchJson('/api/items/'.$item->id.'/snooze', [
            'until' => '2_hours',
            'unavailable_reason_note' => 'Back Thursday',
        ])->assertOk()
            ->assertJsonPath('item.is_snoozed', true)
            ->assertJsonPath('item.unavailable_reason_note', 'Back Thursday');
        $this->assertSame(
            '2026-08-03 12:00:00',
            $item->fresh()->snoozed_until->timezone(config('app.timezone'))->format('Y-m-d H:i:s'),
        );

        $this->patchJson('/api/items/'.$item->id.'/snooze', ['until' => 'end_of_day'])
            ->assertOk();
        $this->assertSame(
            '2026-08-03 23:59:59',
            $item->fresh()->snoozed_until->timezone(config('app.timezone'))->format('Y-m-d H:i:s'),
        );

        $this->patchJson('/api/items/'.$item->id.'/snooze', ['until' => 'tomorrow'])
            ->assertOk();
        $this->assertSame(
            '2026-08-04 23:59:59',
            $item->fresh()->snoozed_until->timezone(config('app.timezone'))->format('Y-m-d H:i:s'),
        );

        $this->patchJson('/api/items/'.$item->id.'/snooze', [
            'until' => 'date',
            'until_date' => '2026-08-07',
            'unavailable_reason_note' => 'Fish delivery',
        ])->assertOk();
        $this->assertSame(
            '2026-08-07 23:59:59',
            $item->fresh()->snoozed_until->timezone(config('app.timezone'))->format('Y-m-d H:i:s'),
        );
        $this->assertSame('Fish delivery', $item->fresh()->unavailable_reason_note);

        $this->patchJson('/api/items/'.$item->id.'/snooze', [
            'until' => 'indefinite',
            'unavailable_reason_note' => 'Supplier delay',
        ])->assertOk()
            ->assertJsonPath('item.is_snoozed', false)
            ->assertJsonPath('item.is_available', false);
        $this->assertNull($item->fresh()->snoozed_until);
        $this->assertFalse($item->fresh()->is_available);

        $fresh = $item->fresh();
        $payload = app(ItemAvailabilityService::class)->withPublicAliases(
            [],
            app(ItemAvailabilityService::class)->check($fresh, 'online_pickup'),
            $fresh,
        );
        $this->assertFalse($payload['available_now']);
        $this->assertSame('item_unavailable', $payload['unavailable_reason']);
        $this->assertSame('Supplier delay', $payload['unavailable_reason_note']);

        $this->patchJson('/api/items/'.$item->id.'/snooze', ['until' => null])
            ->assertOk()
            ->assertJsonPath('item.is_available', true)
            ->assertJsonPath('item.unavailable_reason_note', null);
        $this->assertTrue($item->fresh()->is_available);
        $this->assertNull($item->fresh()->unavailable_reason_note);

        Carbon::setTestNow();
    }

    public function test_reason_note_blank_omitted_from_public_payload(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = Item::factory()->create(['is_available' => true, 'is_active' => true]);
        $this->enableChannels($item);

        $this->patchJson('/api/items/'.$item->id.'/snooze', [
            'until' => 'end_of_day',
            'unavailable_reason_note' => '',
        ])->assertOk();

        $row = collect($this->getJson('/api/items?channel=online_pickup')->json('data'))
            ->firstWhere('id', $item->id);
        $this->assertNull($row['unavailable_reason_note']);
    }
}
