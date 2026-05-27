<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

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

class PreparedStockAdjustTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $cashier;

    private Item $preparedItem;

    private Variant $preparedVariant;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $ownerRole = Role::where('slug', 'owner')->firstOrFail();
        $staffRole = Role::where('slug', 'staff')->firstOrFail();

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-prep@test.com',
            'password' => Hash::make('pw'),
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->cashier = User::create([
            'name' => 'Cashier',
            'email' => 'cashier-prep@test.com',
            'password' => Hash::make('pw'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $cat = Category::create(['name' => 'Bakery', 'sort_order' => 0, 'is_active' => true]);

        $this->preparedItem = Item::create([
            'category_id' => $cat->id,
            'name' => 'Croissant',
            'base_price' => 15,
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 5,
            'has_variants' => false,
        ]);

        $variantItem = Item::create([
            'category_id' => $cat->id,
            'name' => 'Muffin',
            'base_price' => 0,
            'is_active' => true,
            'is_available' => true,
            'has_variants' => true,
        ]);

        $this->preparedVariant = Variant::create([
            'item_id' => $variantItem->id,
            'name' => 'Blueberry',
            'price' => 12,
            'is_active' => true,
            'track_stock' => true,
            'stock_qty' => 8,
            'sort_order' => 0,
        ]);
    }

    public function test_owner_can_list_and_add_prepared_stock(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $list = $this->getJson('/api/prepared-stock');
        $list->assertOk();
        $list->assertJsonFragment(['name' => 'Croissant', 'stock' => 5]);
        $list->assertJsonFragment(['name' => 'Muffin — Blueberry', 'stock' => 8]);

        $adjust = $this->postJson('/api/items/' . $this->preparedItem->id . '/prepared-stock/adjust', [
            'delta' => 10,
            'notes' => 'Morning batch',
        ]);
        $adjust->assertOk();
        $adjust->assertJsonPath('item.stock', 15);

        $this->assertSame(15, (int) $this->preparedItem->fresh()->stock_quantity);
    }

    public function test_owner_can_adjust_variant_prepared_stock(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $itemId = $this->preparedVariant->item_id;

        $adjust = $this->postJson('/api/items/' . $itemId . '/prepared-stock/adjust', [
            'delta' => -3,
            'variant_id' => $this->preparedVariant->id,
        ]);
        $adjust->assertOk();
        $adjust->assertJsonPath('item.stock', 5);

        $this->assertSame(5, (int) $this->preparedVariant->fresh()->stock_qty);
    }

    public function test_staff_without_permission_is_forbidden(): void
    {
        Sanctum::actingAs($this->cashier, ['staff']);

        $this->getJson('/api/prepared-stock')->assertForbidden();
        $this->postJson('/api/items/' . $this->preparedItem->id . '/prepared-stock/adjust', [
            'delta' => 1,
        ])->assertForbidden();
    }

    public function test_cannot_adjust_below_zero(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson('/api/items/' . $this->preparedItem->id . '/prepared-stock/adjust', [
            'delta' => -99,
        ])->assertStatus(422);
    }
}
