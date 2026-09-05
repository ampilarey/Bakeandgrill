<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * An item you sell should not silently vanish.
 *
 * Owner, 2026-09-05: "I have 2 item in one category. Blade menu shows it. But
 * order all doesnt show it." The website menu asks only that an item is active
 * and available; the order app additionally required an enabled row in
 * `item_channel_availability`, as a `whereExists`. So an item switched off for
 * that channel — or one that never got a row at all — disappeared from the app
 * while still showing on the site, with nothing anywhere saying why.
 *
 * "If its not available also have to see but cannot add to cart." So the
 * listing keeps them and marks them unavailable. Everything needed for that
 * already existed: the availability service answers `channel_unavailable`, the
 * app greys unavailable items, and order creation refuses them. Only the query
 * was throwing the rows away.
 */
class ChannelDisabledItemsAreVisibleTest extends TestCase
{
    use RefreshDatabase;

    private function item(string $name): Item
    {
        return Item::create([
            'category_id' => Category::create(['name' => 'Drinks', 'is_active' => true])->id,
            'name' => $name,
            'base_price' => 25,
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    private function setChannel(Item $item, string $channel, bool $enabled): void
    {
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $item->id, 'channel' => $channel],
            ['is_enabled' => $enabled],
        );
    }

    /** @return array<int, array<string, mixed>> */
    private function publicItems(string $channel = 'online_pickup'): array
    {
        return $this->getJson("/api/items?channel={$channel}")->assertOk()->json('data')
            ?? $this->getJson("/api/items?channel={$channel}")->json('items');
    }

    public function test_an_item_switched_off_for_the_channel_is_still_listed(): void
    {
        $item = $this->item('Iced Coffee');
        $this->setChannel($item, 'online_pickup', false);

        $names = array_column($this->publicItems(), 'name');

        $this->assertContains('Iced Coffee', $names, 'A dish you sell must not disappear without explanation.');
    }

    public function test_but_it_is_marked_unavailable_so_it_cannot_be_ordered(): void
    {
        $item = $this->item('Iced Coffee');
        $this->setChannel($item, 'online_pickup', false);

        $row = collect($this->publicItems())->firstWhere('name', 'Iced Coffee');

        $this->assertFalse($row['available_now'], 'Visible is not the same as orderable.');
        $this->assertSame('channel_unavailable', $row['unavailable_reason']);
    }

    public function test_an_item_with_no_channel_row_at_all_is_listed_too(): void
    {
        /*
         * The state that caused the report. The old `whereExists` failed
         * closed, so an item that never got a row was invisible with nothing
         * to switch back on.
         */
        $item = $this->item('Iced Coffee');
        ItemChannelAvailability::where('item_id', $item->id)->delete();

        $row = collect($this->publicItems())->firstWhere('name', 'Iced Coffee');

        $this->assertNotNull($row, 'An item with no channel rows must not vanish.');
        $this->assertFalse($row['available_now']);
    }

    public function test_an_enabled_item_is_still_orderable(): void
    {
        $item = $this->item('Iced Coffee');
        $this->setChannel($item, 'online_pickup', true);

        $row = collect($this->publicItems())->firstWhere('name', 'Iced Coffee');

        $this->assertTrue($row['available_now']);
        $this->assertNull($row['unavailable_reason']);
    }

    public function test_the_order_guard_still_refuses_a_channel_disabled_item(): void
    {
        /*
         * The guard that makes showing these safe, asserted where it lives
         * rather than through the checkout's auth flow. Order creation runs
         * this on every ticket, so an item being visible in the list never
         * makes it buyable.
         */
        $item = $this->item('Iced Coffee');
        $this->setChannel($item, 'online_pickup', false);

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);

        app(\App\Domains\Kitchen\Services\KitchenMenuResolver::class)
            ->assertLineItemsAllowedForOrderType(
                [$item->id => $item],
                [['item_id' => $item->id, 'quantity' => 1]],
                'online_pickup',
            );
    }

    public function test_the_order_guard_accepts_an_enabled_item(): void
    {
        $item = $this->item('Iced Coffee');
        $this->setChannel($item, 'online_pickup', true);

        app(\App\Domains\Kitchen\Services\KitchenMenuResolver::class)
            ->assertLineItemsAllowedForOrderType(
                [$item->id => $item],
                [['item_id' => $item->id, 'quantity' => 1]],
                'online_pickup',
            );

        // No exception is the assertion; say so rather than leave it risky.
        $this->assertTrue(true);
    }

    public function test_catering_keeps_the_hard_filter(): void
    {
        // Catering is a separate wizard; every non-catering item greyed out
        // inside it would be noise rather than information.
        $item = $this->item('Iced Coffee');
        $this->setChannel($item, 'catering', false);

        $names = array_column($this->publicItems('catering'), 'name');

        $this->assertNotContains('Iced Coffee', $names);
    }

    public function test_a_catering_only_item_stays_out_of_the_immediate_menus(): void
    {
        /*
         * The one thing that must not become visible. A buffet package for 50
         * is not a takeaway dish somebody forgot to switch on; greying it
         * across the takeaway menu is noise the customer cannot act on.
         */
        $item = $this->item('Buffet Package');
        foreach (['dine_in', 'takeaway', 'online_pickup', 'delivery'] as $channel) {
            $this->setChannel($item, $channel, false);
        }
        $this->setChannel($item, 'catering', true);

        foreach (['dine_in', 'takeaway', 'online_pickup', 'delivery'] as $channel) {
            $this->assertNotContains(
                'Buffet Package',
                array_column($this->publicItems($channel), 'name'),
                "A catering-only item must not appear on {$channel}.",
            );
        }
    }

    public function test_an_ordinary_item_off_for_one_channel_is_not_mistaken_for_catering(): void
    {
        // It still sells at the till, so the online menu should show it and
        // say it is not orderable — the owner's actual case.
        $item = $this->item('Iced Coffee');
        $this->setChannel($item, 'takeaway', true);
        $this->setChannel($item, 'online_pickup', false);
        $this->setChannel($item, 'catering', true);

        $this->assertContains('Iced Coffee', array_column($this->publicItems(), 'name'));
    }

    public function test_available_only_still_means_only_what_can_be_ordered(): void
    {
        // Asking for what is orderable and getting back what is not would be
        // a plain lie, whatever the menu wants to display.
        $item = $this->item('Iced Coffee');
        $this->setChannel($item, 'online_pickup', false);

        $names = array_column(
            $this->getJson('/api/items?channel=online_pickup&available_only=1')->assertOk()->json('data'),
            'name',
        );

        $this->assertNotContains('Iced Coffee', $names);
    }

    public function test_an_inactive_item_is_still_hidden_everywhere(): void
    {
        // Switching a channel off is "we do not sell this here"; deactivating
        // an item is "this is not on the menu at all", and stays hidden.
        $item = $this->item('Iced Coffee');
        $item->update(['is_active' => false]);

        $names = array_column($this->publicItems(), 'name');

        $this->assertNotContains('Iced Coffee', $names);
    }
}
