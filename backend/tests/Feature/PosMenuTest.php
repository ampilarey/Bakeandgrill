<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PosMenuTest extends TestCase
{
    use RefreshDatabase;

    public function test_pos_menu_returns_categories_and_channel_items_in_one_response(): void
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'POS Food', 'slug' => 'pos-food', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'POS Burger',
            'base_price' => 40.0,
            'sku' => 'POS-BRG',
            'is_active' => true,
            'is_available' => true,
        ]);
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $item->id, 'channel' => 'dine_in'],
            ['is_enabled' => true],
        );

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'POS Menu Cashier',
            'email' => 'pos-menu@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        Sanctum::actingAs($staff, ['staff']);

        $response = $this->getJson('/api/pos/menu?channel=dine_in')
            ->assertOk();

        $response->assertJsonPath('categories.0.name', 'POS Food');
        $response->assertJsonPath('items.0.name', 'POS Burger');
        $response->assertJsonStructure([
            'categories' => [['id', 'name']],
            'items' => [['id', 'name', 'availability' => ['available']]],
        ]);
    }

    public function test_pos_menu_includes_variant_special_pricing(): void
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'POS Drinks', 'slug' => 'pos-drinks', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'POS Water',
            'base_price' => 0,
            'has_variants' => true,
            'sku' => 'POS-WATER',
            'is_active' => true,
            'is_available' => true,
        ]);
        $variant = \App\Models\Variant::create([
            'item_id' => $item->id,
            'name' => 'Small',
            'price' => 5.00,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $item->id, 'channel' => 'dine_in'],
            ['is_enabled' => true],
        );

        $special = \App\Models\DailySpecial::create([
            'item_id' => $item->id,
            'is_active' => true,
            'start_date' => today()->toDateString(),
            'end_date' => today()->toDateString(),
            'discount_pct' => null,
            'special_price' => null,
        ]);
        \App\Models\DailySpecialVariant::create([
            'daily_special_id' => $special->id,
            'variant_id' => $variant->id,
            'discount_pct' => 20,
        ]);
        app(\App\Services\SpecialPricingService::class)->bustCache();

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'POS Special Cashier',
            'email' => 'pos-special@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        Sanctum::actingAs($staff, ['staff']);

        $response = $this->getJson('/api/pos/menu?channel=dine_in')->assertOk();
        $found = collect($response->json('items'))->firstWhere('id', $item->id);
        $variantRow = collect($found['variants'])->firstWhere('id', $variant->id);

        $this->assertNotNull($found);
        $this->assertArrayHasKey('special', $found);
        $this->assertEqualsWithDelta(4.00, (float) $variantRow['effective_price'], 0.01);
        $this->assertEqualsWithDelta(5.00, (float) $variantRow['original_price'], 0.01);
    }

    /**
     * Owner, 2026-08-18: "i have category and subcategory, but still in pos
     * they are in same line."
     *
     * The nesting was right in the database and the POS already knew how to
     * draw a two-row strip from it — top-level pills, then the selected
     * parent's children — and to gather an item's descendants when a parent is
     * picked. But PosMenuBuilder selected a hand-picked column list that left
     * parent_id out, so every category reached the till looking top-level:
     * one flat row, and a parent that showed nothing because its items are
     * filed under its children.
     *
     * The column list is easy to trim again by accident, so this pins it.
     */
    public function test_pos_menu_carries_the_category_nesting(): void
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $food = Category::create(['name' => 'Food', 'slug' => 'nest-food', 'is_active' => true]);
        $shorteats = Category::create([
            'name' => 'Shorteats',
            'slug' => 'nest-shorteats',
            'parent_id' => $food->id,
            'is_active' => true,
        ]);

        $item = Item::create([
            'category_id' => $shorteats->id,
            'name' => 'Bajiya',
            'base_price' => 5.0,
            'sku' => 'NEST-BAJ',
            'is_active' => true,
            'is_available' => true,
        ]);
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $item->id, 'channel' => 'dine_in'],
            ['is_enabled' => true],
        );

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'Nesting Cashier',
            'email' => 'pos-nesting@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($staff, ['staff']);

        foreach (['/api/pos/menu?channel=dine_in', '/api/pos/bootstrap?channel=dine_in'] as $url) {
            $categories = collect($this->getJson($url)->assertOk()->json('categories'));

            $parent = $categories->firstWhere('name', 'Food');
            $child = $categories->firstWhere('name', 'Shorteats');

            $this->assertNotNull($parent, "[{$url}] parent category missing");
            $this->assertNotNull($child, "[{$url}] child category missing");

            // Present as a key on both, so the POS can tell a root from a leaf.
            $this->assertArrayHasKey('parent_id', $parent, "[{$url}] parent_id was dropped from the payload");
            $this->assertArrayHasKey('parent_id', $child, "[{$url}] parent_id was dropped from the payload");

            $this->assertNull($parent['parent_id'], "[{$url}] a top-level category must have no parent");
            $this->assertSame(
                $food->id,
                $child['parent_id'],
                "[{$url}] the sub-category must point at its parent, or the POS draws one flat row",
            );
        }
    }

    /**
     * Suggestion chips ride along with the menu instead of asking per item.
     *
     * The till caches this payload for offline service; a chip that needs its
     * own round trip vanishes the moment the connection drops, which behind a
     * counter is exactly when nobody can wait for it.
     */
    public function test_pos_menu_carries_pairings_for_the_suggestion_chips(): void
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Pairs', 'slug' => 'pos-pairs', 'is_active' => true]);

        $make = function (string $name, float $price) use ($category) {
            $item = Item::create([
                'category_id' => $category->id,
                'name' => $name,
                'base_price' => $price,
                'sku' => 'PAIR-' . strtoupper(substr(md5($name), 0, 5)),
                'is_active' => true,
                'is_available' => true,
            ]);
            ItemChannelAvailability::query()->updateOrCreate(
                ['item_id' => $item->id, 'channel' => 'dine_in'],
                ['is_enabled' => true],
            );

            return $item;
        };

        $burger = $make('Pair Burger', 60);
        $fries = $make('Pair Fries', 25);

        // Enough orders to clear the support floor, or nothing is suggested.
        for ($i = 0; $i < 5; $i++) {
            $order = Order::create([
                'order_number' => 'POSPAIR-' . str()->random(6),
                'type' => 'dine_in',
                'status' => 'paid',
                'payment_status' => 'paid',
                'subtotal' => 85,
                'total' => 85,
            ]);
            foreach ([$burger, $fries] as $line) {
                DB::table('order_items')->insert([
                    'order_id' => $order->id,
                    'item_id' => $line->id,
                    'item_name' => $line->name,
                    'quantity' => 1,
                    'unit_price' => $line->base_price,
                    'total_price' => $line->base_price,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
        app(\App\Domains\Marketing\Services\ItemAffinityService::class)->recompute(90);

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'Pairing Cashier',
            'email' => 'pos-pairing@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($staff, ['staff']);

        foreach (['/api/pos/menu?channel=dine_in', '/api/pos/bootstrap?channel=dine_in'] as $url) {
            $pairings = $this->getJson($url)->assertOk()->json('pairings');

            $this->assertIsArray($pairings, "[{$url}] pairings missing from the payload");
            $this->assertSame([$fries->id], $pairings[$burger->id] ?? null, "[{$url}] burger should suggest fries");
            $this->assertSame([$burger->id], $pairings[$fries->id] ?? null, "[{$url}] and the reverse");
        }
    }

    /**
     * A chip the cashier cannot tap is worse than no chip.
     *
     * Two ways an item becomes untappable, and they behave differently:
     * a channel-blocked item is dropped from the payload entirely, while a
     * sold-out or snoozed one still travels in it flagged unavailable. The
     * pairings are therefore built from the available set, not from presence.
     * This covers the first; test_pairings_skip_a_sold_out_item covers the second.
     */
    public function test_pairings_never_point_at_an_item_absent_from_this_channel(): void
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Channel', 'slug' => 'pos-channel', 'is_active' => true]);

        $onMenu = Item::create([
            'category_id' => $category->id, 'name' => 'On Menu', 'base_price' => 30,
            'sku' => 'CH-ON', 'is_active' => true, 'is_available' => true,
        ]);
        $offMenu = Item::create([
            'category_id' => $category->id, 'name' => 'Online Only', 'base_price' => 20,
            'sku' => 'CH-OFF', 'is_active' => true, 'is_available' => true,
        ]);
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $onMenu->id, 'channel' => 'dine_in'],
            ['is_enabled' => true],
        );
        // Item::booted() enables every channel on create, so taking one away
        // has to be explicit.
        ItemChannelAvailability::query()->updateOrCreate(
            ['item_id' => $offMenu->id, 'channel' => 'dine_in'],
            ['is_enabled' => false],
        );

        for ($i = 0; $i < 5; $i++) {
            $order = Order::create([
                'order_number' => 'POSCH-' . str()->random(6),
                'type' => 'delivery', 'status' => 'paid', 'payment_status' => 'paid',
                'subtotal' => 50, 'total' => 50,
            ]);
            foreach ([$onMenu, $offMenu] as $line) {
                DB::table('order_items')->insert([
                    'order_id' => $order->id, 'item_id' => $line->id, 'item_name' => $line->name,
                    'quantity' => 1, 'unit_price' => $line->base_price, 'total_price' => $line->base_price,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
        app(\App\Domains\Marketing\Services\ItemAffinityService::class)->recompute(90);

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'Channel Cashier', 'email' => 'pos-channel@test.local',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        Sanctum::actingAs($staff, ['staff']);

        $body = $this->getJson('/api/pos/menu?channel=dine_in')->assertOk()->json();

        $servedIds = collect($body['items'])->pluck('id')->all();
        $this->assertNotContains($offMenu->id, $servedIds, 'precondition: the item is not on the dine-in menu');

        foreach ($body['pairings'] ?? [] as $suggested) {
            $this->assertNotContains(
                $offMenu->id,
                $suggested,
                'a chip must never point at something this channel cannot sell',
            );
        }
    }

    /**
     * The case presence alone would miss: a sold-out item is still in the
     * payload, just flagged unavailable. Suggesting it puts a chip on screen
     * that does nothing when the cashier taps it.
     */
    public function test_pairings_skip_a_sold_out_item(): void
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Stock', 'slug' => 'pos-stock', 'is_active' => true]);

        $burger = Item::create([
            'category_id' => $category->id, 'name' => 'Stock Burger', 'base_price' => 60,
            'sku' => 'ST-BRG', 'is_active' => true, 'is_available' => true,
        ]);
        $fries = Item::create([
            'category_id' => $category->id, 'name' => 'Stock Fries', 'base_price' => 25,
            'sku' => 'ST-FRY', 'is_active' => true, 'is_available' => true,
        ]);

        for ($i = 0; $i < 5; $i++) {
            $order = Order::create([
                'order_number' => 'POSST-' . str()->random(6),
                'type' => 'dine_in', 'status' => 'paid', 'payment_status' => 'paid',
                'subtotal' => 85, 'total' => 85,
            ]);
            foreach ([$burger, $fries] as $line) {
                DB::table('order_items')->insert([
                    'order_id' => $order->id, 'item_id' => $line->id, 'item_name' => $line->name,
                    'quantity' => 1, 'unit_price' => $line->base_price, 'total_price' => $line->base_price,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
        app(\App\Domains\Marketing\Services\ItemAffinityService::class)->recompute(90);

        // Fries run out after the pairs were computed — the usual case.
        $fries->update(['is_available' => false]);

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'Stock Cashier', 'email' => 'pos-stock@test.local',
            'password' => Hash::make('password'), 'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        Sanctum::actingAs($staff, ['staff']);

        $body = $this->getJson('/api/pos/menu?channel=dine_in')->assertOk()->json();

        $friesRow = collect($body['items'])->firstWhere('id', $fries->id);
        $this->assertNotNull($friesRow, 'precondition: a sold-out item still travels in the payload');
        $this->assertFalse($friesRow['availability']['available'], 'precondition: flagged unavailable');

        $this->assertArrayNotHasKey(
            $burger->id,
            $body['pairings'] ?? [],
            'the only pairing pointed at a sold-out item, so the burger should offer nothing',
        );
    }
}
