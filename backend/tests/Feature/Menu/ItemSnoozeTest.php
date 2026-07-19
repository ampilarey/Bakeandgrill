<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\User;
use App\Services\PosMenuBuilder;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ItemSnoozeTest extends TestCase
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

    public function test_snooze_hides_from_online_available_only(): void
    {
        $item = Item::factory()->create(['is_available' => true, 'is_active' => true]);
        $this->enableChannels($item);

        $this->getJson('/api/items?channel=online_pickup&available_only=1')
            ->assertOk();
        $ids = collect($this->getJson('/api/items?channel=online_pickup&available_only=1')->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($item->id));

        $item->update(['snoozed_until' => now()->endOfDay()]);

        $idsAfter = collect($this->getJson('/api/items?channel=online_pickup&available_only=1')->json('data'))->pluck('id');
        $this->assertFalse($idsAfter->contains($item->id));
    }

    public function test_pos_menu_marks_snoozed_unavailable(): void
    {
        $item = Item::factory()->create(['is_available' => true, 'is_active' => true]);
        $this->enableChannels($item);
        $item->update(['snoozed_until' => now()->endOfDay()]);

        $payload = app(PosMenuBuilder::class)->build('dine_in');
        $row = collect($payload['items'])->firstWhere('id', $item->id);
        $this->assertNotNull($row);
        $this->assertFalse($row['availability']['available']);
        $this->assertSame('snoozed', $row['availability']['reason_code']);
    }

    public function test_snooze_expires_and_item_returns(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-19 10:00:00', config('app.timezone')));
        $item = Item::factory()->create(['is_available' => true, 'is_active' => true]);
        $this->enableChannels($item);
        $item->update(['snoozed_until' => now()->endOfDay()]);

        $this->assertTrue($item->fresh()->isSnoozed());

        Carbon::setTestNow(Carbon::parse('2026-07-20 00:00:01', config('app.timezone')));
        $this->assertFalse($item->fresh()->isSnoozed());

        $ids = collect($this->getJson('/api/items?channel=online_pickup&available_only=1')->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($item->id));

        Carbon::setTestNow();
    }

    public function test_snooze_endpoint_requires_prepared_stock_permission(): void
    {
        $item = Item::factory()->create();
        $user = User::factory()->create();
        Sanctum::actingAs($user, ['staff']);

        $this->patchJson('/api/items/' . $item->id . '/snooze', ['until' => 'end_of_day'])
            ->assertStatus(403);
    }

    public function test_snooze_toggle_idempotent(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = Item::factory()->create();

        $this->patchJson('/api/items/' . $item->id . '/snooze', ['until' => 'end_of_day'])
            ->assertOk()
            ->assertJsonPath('item.is_snoozed', true);

        $this->patchJson('/api/items/' . $item->id . '/snooze', ['until' => 'end_of_day'])
            ->assertOk()
            ->assertJsonPath('item.is_snoozed', true);

        $this->patchJson('/api/items/' . $item->id . '/snooze', ['until' => null])
            ->assertOk()
            ->assertJsonPath('item.is_snoozed', false);

        $this->assertNull($item->fresh()->snoozed_until);
    }
}
