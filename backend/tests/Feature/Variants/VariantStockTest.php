<?php

declare(strict_types=1);

namespace Tests\Feature\Variants;

use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\User;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class VariantStockTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    private Item $variantItem;

    private Variant $variantSmall;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['id' => 1], ['name' => 'Default', 'slug' => 'default', 'sort_order' => 0, 'is_active' => true]);

        $role = Role::create(['name' => 'Owner', 'slug' => 'owner', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Staff', 'email' => 'stock@test.com', 'password' => Hash::make('pw'),
            'role_id' => $role->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'POS-STK', 'identifier' => 'POS-STK-001', 'type' => 'pos', 'is_active' => true,
        ]);

        $cat = Category::create(['name' => 'Drinks', 'sort_order' => 0, 'is_active' => true]);

        $this->variantItem = Item::create([
            'name' => 'Juice', 'base_price' => 0, 'is_active' => true,
            'is_available' => true, 'category_id' => $cat->id, 'has_variants' => true,
        ]);

        $this->variantSmall = Variant::create([
            'item_id' => $this->variantItem->id,
            'name' => 'Small',
            'price' => 8.00,
            'is_active' => true,
            'sort_order' => 0,
            'track_stock' => true,
            'stock_qty' => 3,
        ]);
    }

    private function postOrder(array $items): \Illuminate\Testing\TestResponse
    {
        $this->ensurePosApiReady($this->staff, $this->device);

        return $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson('/api/orders', [
                'type' => 'dine_in',
                'items' => $items,
            ]);
    }

    public function test_variant_stock_deducted_on_pos_order(): void
    {
        $res = $this->postOrder([
            ['item_id' => $this->variantItem->id, 'quantity' => 2, 'variant_id' => $this->variantSmall->id],
        ]);

        $res->assertStatus(201);
        $this->assertDatabaseHas('variants', [
            'id' => $this->variantSmall->id,
            'stock_qty' => 1, // 3 - 2 = 1
        ]);
    }

    public function test_order_fails_when_variant_out_of_stock(): void
    {
        // Exhaust all 3 units first
        $this->postOrder([
            ['item_id' => $this->variantItem->id, 'quantity' => 3, 'variant_id' => $this->variantSmall->id],
        ])->assertStatus(201);

        // Now try to order 1 more — should fail with 422
        $res = $this->postOrder([
            ['item_id' => $this->variantItem->id, 'quantity' => 1, 'variant_id' => $this->variantSmall->id],
        ]);

        $res->assertStatus(422);
    }

    public function test_item_level_stock_unaffected_when_variant_tracks_own_stock(): void
    {
        // item stock_quantity is null — should not be touched
        $initialItemStock = $this->variantItem->stock_quantity;

        $this->postOrder([
            ['item_id' => $this->variantItem->id, 'quantity' => 1, 'variant_id' => $this->variantSmall->id],
        ])->assertStatus(201);

        // Item-level stock_quantity remains unchanged
        $this->assertEquals($initialItemStock, $this->variantItem->fresh()->stock_quantity);
    }

    public function test_stock_movement_logged_for_variant_deduction(): void
    {
        $this->postOrder([
            ['item_id' => $this->variantItem->id, 'quantity' => 1, 'variant_id' => $this->variantSmall->id],
        ])->assertStatus(201);

        $this->assertDatabaseHas('stock_movements', [
            'reference_type' => 'variant',
            'reference_id' => $this->variantSmall->id,
            'quantity' => -1,
        ]);
    }

    public function test_variant_without_track_stock_allows_unlimited_orders(): void
    {
        $unlimitedVariant = Variant::create([
            'item_id' => $this->variantItem->id,
            'name' => 'Large (unlimited)',
            'price' => 12.00,
            'is_active' => true,
            'sort_order' => 1,
            'track_stock' => false,
            'stock_qty' => 0,
        ]);

        // Order 99 — should succeed because track_stock=false
        $res = $this->postOrder([
            ['item_id' => $this->variantItem->id, 'quantity' => 99, 'variant_id' => $unlimitedVariant->id],
        ]);

        $res->assertStatus(201);
    }
}
