<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\Role;
use App\Models\User;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-03: "I edited the tea to black tea and removed the
 * variants; the editor shows none, but the quick-edit list still shows the
 * old variants." Switching sizes off must remove them, and a sizeless item
 * must list no sizes anywhere.
 */
class SizelessItemDropsVariantsTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsStaff(): void
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        Sanctum::actingAs(User::create([
            'name' => 'Owner', 'email' => 'sizeless-owner@test.local', 'password' => Hash::make('password'),
            'role_id' => $role->id, 'is_active' => true,
        ]), ['staff']);
    }

    private function teaWithSizes(): Item
    {
        $cat = Category::create(['name' => 'Drinks', 'slug' => 'drinks-sizeless', 'is_active' => true]);
        $tea = Item::factory()->create(['name' => 'Tea', 'category_id' => $cat->id, 'has_variants' => true, 'is_active' => true]);
        $tea->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true, 'sort_order' => 0]);
        $tea->variants()->create(['name' => 'Large', 'price' => 15, 'is_active' => true, 'sort_order' => 1]);

        return $tea;
    }

    public function test_saving_with_sizes_off_and_no_list_removes_the_sizes(): void
    {
        $this->actingAsStaff();
        $tea = $this->teaWithSizes();

        $this->patchJson("/api/items/{$tea->id}", ['name' => 'Black Tea', 'has_variants' => false])->assertOk();

        $this->assertSame(0, Variant::where('item_id', $tea->id)->count(), 'never-sold sizes are deleted');
        $this->assertFalse($tea->fresh()->has_variants);
    }

    public function test_saving_with_an_empty_list_removes_the_sizes_too(): void
    {
        $this->actingAsStaff();
        $tea = $this->teaWithSizes();

        $this->patchJson("/api/items/{$tea->id}", ['has_variants' => false, 'variants' => []])->assertOk();

        $this->assertSame(0, Variant::where('item_id', $tea->id)->count());
    }

    public function test_a_sizeless_item_lists_no_sizes_in_the_admin_list_or_the_editor(): void
    {
        $this->actingAsStaff();
        $tea = $this->teaWithSizes();
        // The state production was in: flagged sizeless, rows still there.
        $tea->update(['has_variants' => false]);

        $list = $this->getJson('/api/items?admin=1&per_page=50')->assertOk()->json('data');
        $row = collect($list)->firstWhere('id', $tea->id);
        $this->assertSame([], $row['variants'], 'quick-edit list');

        $show = $this->getJson("/api/items/{$tea->id}")->assertOk()->json('item') ?? $this->getJson("/api/items/{$tea->id}")->json();
        $this->assertSame([], $show['variants'] ?? [], 'editor');
    }

    public function test_the_clean_up_retires_ordered_sizes_and_deletes_the_rest(): void
    {
        $tea = $this->teaWithSizes();
        $tea->update(['has_variants' => false]);
        $small = $tea->variants()->where('name', 'Small')->first();
        $order = \App\Models\Order::factory()->create();
        \App\Models\OrderItem::create([
            'order_id' => $order->id, 'item_id' => $tea->id, 'variant_id' => $small->id,
            'item_name' => 'Tea', 'quantity' => 1, 'unit_price' => 10, 'total_price' => 10,
        ]);

        (require database_path('migrations/2026_09_03_170000_retire_variants_of_sizeless_items.php'))->up();

        $this->assertFalse((bool) $small->fresh()->is_active, 'ordered size retired, kept for receipts');
        $this->assertNull(Variant::where('item_id', $tea->id)->where('name', 'Large')->first(), 'never-sold size deleted');
    }
}
