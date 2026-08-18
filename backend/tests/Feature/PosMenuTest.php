<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemChannelAvailability;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
