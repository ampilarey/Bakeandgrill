<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Owner, 2026-09-03: "in admin, there is no sort option in menu items". */
class AdminItemSortTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsStaff(): void
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        Sanctum::actingAs(User::create([
            'name' => 'Owner', 'email' => 'sort-owner@test.local', 'password' => Hash::make('password'),
            'role_id' => $role->id, 'is_active' => true,
        ]), ['staff']);
    }

    /** @return array<string, Item> */
    private function seedItems(): array
    {
        $bakery = Category::create(['name' => 'Bakery', 'slug' => 'bakery-sort', 'is_active' => true, 'sort_order' => 2]);
        $grill = Category::create(['name' => 'Grill', 'slug' => 'grill-sort', 'is_active' => true, 'sort_order' => 1]);

        $mk = fn (string $name, Category $cat, float $price, int $sort, bool $available = true) => Item::factory()->create([
            'name' => $name, 'category_id' => $cat->id, 'base_price' => $price, 'sort_order' => $sort,
            'is_available' => $available, 'is_active' => true,
        ]);

        return [
            'croissant' => $mk('Croissant', $bakery, 15, 3),
            'bajiya' => $mk('Bajiya', $bakery, 5, 1),
            'kebab' => $mk('Kebab', $grill, 45, 2, false),
        ];
    }

    private function names(string $sort = ''): array
    {
        $res = $this->getJson('/api/items?admin=1&per_page=50' . ($sort !== '' ? '&sort=' . $sort : ''))->assertOk();

        // Only the three seeded here — migrations add system items of their own.
        return array_values(array_filter(
            array_map(fn ($r) => $r['name'], $res->json('data')),
            fn ($n) => in_array($n, ['Bajiya', 'Kebab', 'Croissant'], true),
        ));
    }

    public function test_admin_can_order_the_list_each_way_and_the_default_is_the_menu_order(): void
    {
        $this->actingAsStaff();
        $this->seedItems();

        $this->assertSame(['Bajiya', 'Kebab', 'Croissant'], $this->names(), 'default: menu sort_order');
        $this->assertSame(['Bajiya', 'Croissant', 'Kebab'], $this->names('name'));
        $this->assertSame(['Kebab', 'Croissant', 'Bajiya'], $this->names('name_desc'));
        $this->assertSame(['Bajiya', 'Croissant', 'Kebab'], $this->names('price'));
        $this->assertSame(['Kebab', 'Croissant', 'Bajiya'], $this->names('price_desc'));
        // Grill (sort 1) before Bakery (sort 2); inside a category the menu order.
        $this->assertSame(['Kebab', 'Bajiya', 'Croissant'], $this->names('category'));
        $this->assertSame(['Kebab', 'Bajiya', 'Croissant'], $this->names('unavailable'));
        $this->assertSame(['Bajiya', 'Kebab', 'Croissant'], $this->names('nonsense'), 'unknown sort falls back');
    }

    /**
     * The admin dashboard signs in with a session cookie, not a token. The
     * staff check used to read the token ability only, so a session admin
     * was served the public list and the sort was ignored (owner,
     * 2026-09-03: "sort option is there but not sorting").
     */
    public function test_admin_signed_in_with_a_session_gets_the_sort_and_the_admin_list(): void
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Owner', 'email' => 'session-owner@test.local', 'password' => Hash::make('password'),
            'role_id' => $role->id, 'is_active' => true,
        ]);
        $this->seedItems();
        Item::factory()->create(['name' => 'Hidden', 'category_id' => Category::first()->id, 'is_active' => false]);

        $res = $this->actingAs($user)->getJson('/api/items?admin=1&per_page=50&sort=name_desc')->assertOk();
        $names = array_values(array_filter(
            array_map(fn ($r) => $r['name'], $res->json('data')),
            fn ($n) => in_array($n, ['Bajiya', 'Kebab', 'Croissant', 'Hidden'], true),
        ));
        $this->assertSame(['Kebab', 'Hidden', 'Croissant', 'Bajiya'], $names, 'sorted, and off-menu items are listed for staff');
    }

    public function test_recently_updated_comes_first_under_updated(): void
    {
        $this->actingAsStaff();
        $items = $this->seedItems();
        Item::query()->update(['updated_at' => now()->subDay()]);
        Item::query()->whereKey($items['croissant']->id)->update(['updated_at' => now()]);

        $this->assertSame('Croissant', $this->names('updated')[0]);
    }

    public function test_public_menu_ignores_the_admin_sort(): void
    {
        $items = $this->seedItems();
        foreach ($items as $item) {
            foreach (\App\Domains\Kitchen\Services\KitchenMenuResolver::ORDERING_CHANNELS as $channel) {
                \App\Models\ItemChannelAvailability::query()->updateOrCreate(
                    ['item_id' => $item->id, 'channel' => $channel],
                    ['is_enabled' => true],
                );
            }
        }

        $res = $this->getJson('/api/items?channel=online_pickup&sort=price_desc')->assertOk();
        $names = array_values(array_map(fn ($r) => $r['name'], $res->json('data')));
        // Kebab is unavailable but still listed; order is the menu's own.
        $this->assertSame(['Bajiya', 'Kebab', 'Croissant'], $names);
    }
}
