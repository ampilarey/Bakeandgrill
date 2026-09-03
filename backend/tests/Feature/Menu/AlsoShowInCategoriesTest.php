<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-03: "Bajiya is Hedhikaa → Kulhi Hedhikaa, but it's an
 * evening tea item, so can it be in that too?" One home category plus
 * "also show in" placements; the same card under each, counted once.
 */
class AlsoShowInCategoriesTest extends TestCase
{
    use RefreshDatabase;

    private Category $hedhikaa;

    private Category $kulhi;

    private Category $eveningTea;

    private function actingAsStaff(): void
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        Sanctum::actingAs(User::create([
            'name' => 'Owner', 'email' => 'also-owner@test.local', 'password' => Hash::make('password'),
            'role_id' => $role->id, 'is_active' => true,
        ]), ['staff']);
    }

    private function categories(): void
    {
        $this->hedhikaa = Category::create(['name' => 'Hedhikaa', 'slug' => 'hedhikaa-also', 'is_active' => true, 'sort_order' => 1]);
        $this->kulhi = Category::create(['name' => 'Kulhi Hedhikaa', 'slug' => 'kulhi-also', 'is_active' => true, 'sort_order' => 1, 'parent_id' => $this->hedhikaa->id]);
        $this->eveningTea = Category::create(['name' => 'Evening Tea', 'slug' => 'evening-tea-also', 'is_active' => true, 'sort_order' => 2]);
    }

    private function bajiya(): Item
    {
        $item = Item::factory()->create([
            'name' => 'Bajiya', 'category_id' => $this->kulhi->id, 'is_active' => true, 'is_available' => true, 'base_price' => 5,
        ]);
        foreach (KitchenMenuResolver::ORDERING_CHANNELS as $channel) {
            ItemChannelAvailability::query()->updateOrCreate(['item_id' => $item->id, 'channel' => $channel], ['is_enabled' => true]);
        }

        return $item;
    }

    public function test_an_item_can_be_given_extra_categories_and_the_home_is_never_one_of_them(): void
    {
        $this->actingAsStaff();
        $this->categories();
        $bajiya = $this->bajiya();

        $this->patchJson("/api/items/{$bajiya->id}", [
            'extra_category_ids' => [$this->eveningTea->id, $this->kulhi->id, $this->eveningTea->id],
        ])->assertOk();

        $this->assertSame([$this->eveningTea->id], $bajiya->fresh()->extraCategoryIds(), 'home dropped, duplicate collapsed');

        $show = $this->getJson("/api/items/{$bajiya->id}")->assertOk()->json();
        $this->assertSame([$this->eveningTea->id], $show['extra_category_ids'] ?? ($show['item']['extra_category_ids'] ?? null));

        $list = collect($this->getJson('/api/items?admin=1&per_page=50')->assertOk()->json('data'))->firstWhere('id', $bajiya->id);
        $this->assertSame([$this->eveningTea->id], $list['extra_category_ids']);

        // Saving again with an empty list clears them.
        $this->patchJson("/api/items/{$bajiya->id}", ['extra_category_ids' => []])->assertOk();
        $this->assertSame([], $bajiya->fresh()->extraCategoryIds());
    }

    public function test_the_public_list_carries_the_placements_and_keeps_one_row_per_item(): void
    {
        $this->categories();
        $bajiya = $this->bajiya();
        $bajiya->extraCategories()->sync([$this->eveningTea->id]);

        $rows = collect($this->getJson('/api/items?channel=online_pickup')->assertOk()->json('data'))
            ->where('name', 'Bajiya');

        $this->assertCount(1, $rows, 'placement is data on the row, not a second row');
        $this->assertSame([$this->eveningTea->id], $rows->first()['extra_category_ids']);
        $this->assertSame($this->kulhi->id, $rows->first()['category_id']);
    }

    public function test_the_website_menu_lists_the_item_under_both_sections(): void
    {
        $this->categories();
        $bajiya = $this->bajiya();
        $bajiya->extraCategories()->sync([$this->eveningTea->id]);

        $groups = $this->get('/menu')->assertOk()->viewData('menuCategories');

        $under = fn (string $categoryName) => collect($groups)
            ->flatMap(fn ($g) => array_merge(
                [[($g['category']?->name ?? '—'), $g['items']]],
                array_map(fn ($s) => [$s['category']->name, $s['items']], $g['subcategories'] ?? []),
            ))
            ->filter(fn ($pair) => $pair[0] === $categoryName)
            ->flatMap(fn ($pair) => collect($pair[1])->pluck('name'))
            ->values()
            ->all();

        $this->assertSame(['Bajiya'], $under('Kulhi Hedhikaa'), 'home sub-category');
        $this->assertSame(['Bajiya'], $under('Evening Tea'), 'also shown in');
        $this->assertSame([], $under('—'), 'not left over as unplaced');
    }

    public function test_deleting_a_category_drops_its_placements_but_not_the_item(): void
    {
        $this->categories();
        $bajiya = $this->bajiya();
        $bajiya->extraCategories()->sync([$this->eveningTea->id]);

        $this->eveningTea->delete();

        $this->assertNotNull($bajiya->fresh());
        $this->assertSame([], $bajiya->fresh()->extraCategoryIds());
    }
}
