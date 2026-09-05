<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Catalog\Services\NewMenuItemService;
use App\Models\Category;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A new dish is new on every menu that says so.
 *
 * Owner, 2026-09-05: "In blade menu new items are marked. But on order app its
 * not showing." The rule lived inside MenuPageController, so the website was
 * the only surface that could apply it — the order app's card has carried a
 * NEW badge all along with nothing passing it, because the API never said
 * which items were new.
 *
 * Both now read NewMenuItemService, so the question these tests really ask is
 * whether the two surfaces can drift apart again.
 */
class NewItemsAreMarkedOnBothMenusTest extends TestCase
{
    use RefreshDatabase;

    private function dish(string $name, int $daysAgo, bool $active = true, bool $available = true): Item
    {
        $item = Item::create([
            'category_id' => Category::firstOrCreate(
                ['name' => 'Bondibai'],
                ['is_active' => true],
            )->id,
            'name' => $name,
            'base_price' => 25,
            'is_active' => $active,
            'is_available' => $available,
        ]);

        // created_at is set by the model, so move it deliberately.
        $item->forceFill(['created_at' => now()->subDays($daysAgo)])->saveQuietly();

        return $item->fresh();
    }

    /** @return array<string, bool> name => is_new, as the order app receives it */
    private function apiMarks(): array
    {
        $rows = $this->getJson('/api/items?channel=online_pickup&view=customer')
            ->assertOk()
            ->json('data');

        return array_combine(
            array_column($rows, 'name'),
            array_map(fn ($r) => (bool) ($r['is_new'] ?? false), $rows),
        );
    }

    public function test_a_dish_added_today_is_marked_new(): void
    {
        $this->dish('Valhomas', 0);

        $this->assertTrue($this->apiMarks()['Valhomas']);
    }

    public function test_a_dish_older_than_the_window_is_not(): void
    {
        $this->dish('Old Faithful', 45);

        $this->assertFalse($this->apiMarks()['Old Faithful']);
    }

    public function test_the_window_is_the_one_the_owner_configured(): void
    {
        // Content Hub's menu_new_days, so shortening it on the website
        // shortens it in the app too.
        \App\Models\SiteSetting::updateOrCreate(['key' => 'menu_new_days'], ['value' => '7']);
        $this->dish('Ten Days Old', 10);

        $this->assertFalse($this->apiMarks()['Ten Days Old']);
    }

    public function test_both_menus_mark_exactly_the_same_dishes(): void
    {
        // The actual complaint: two surfaces, one menu, different badges.
        foreach (['A' => 0, 'B' => 1, 'C' => 2, 'D' => 90] as $name => $age) {
            $this->dish($name, $age);
        }

        $blade = array_keys(app(NewMenuItemService::class)->newItemIds());
        $api = array_keys(array_filter($this->apiMarks()));
        $apiIds = Item::whereIn('name', $api)->pluck('id')->sort()->values()->all();

        sort($blade);
        $this->assertSame($blade, $apiIds, 'The website and the order app must mark the same dishes.');
    }

    public function test_only_the_newest_handful_wear_the_badge(): void
    {
        // "New" stops meaning anything when half the menu is wearing it, so
        // the cap holds however many dishes were added at once.
        for ($i = 1; $i <= NewMenuItemService::CAP + 5; $i++) {
            $this->dish(sprintf('Dish %02d', $i), $i);
        }

        $this->assertCount(NewMenuItemService::CAP, array_filter($this->apiMarks()));
    }

    public function test_the_newest_are_the_ones_kept(): void
    {
        for ($i = 1; $i <= NewMenuItemService::CAP + 3; $i++) {
            $this->dish(sprintf('Dish %02d', $i), $i);
        }

        $marked = array_keys(array_filter($this->apiMarks()));

        $this->assertContains('Dish 01', $marked, 'The newest dish must be marked.');
        $this->assertNotContains('Dish 15', $marked, 'The oldest must not push out a newer one.');
    }

    public function test_a_dish_that_is_off_the_menu_is_not_marked_new(): void
    {
        // Nothing should be advertised as a new arrival while it is not for
        // sale — including one snoozed or switched off after launch.
        $this->dish('Sold Out Special', 0, available: false);

        $this->assertSame([], array_keys(app(NewMenuItemService::class)->newItemIds()));
    }

    public function test_the_admin_listing_does_not_carry_the_flag(): void
    {
        // It is a customer-facing display concern; the admin table has its own
        // columns and does not need the query behind it.
        $this->dish('Valhomas', 0);

        \Laravel\Sanctum\Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->assertNull($this->getJson('/api/items')->assertOk()->json('data.0.is_new'));
    }
}
