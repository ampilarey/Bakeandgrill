<?php

declare(strict_types=1);

namespace Tests\Feature\Variants;

use App\Models\Category;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\User;
use App\Models\Variant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VariantCrudTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['id' => 1], ['name' => 'Default', 'slug' => 'default', 'sort_order' => 0, 'is_active' => true]);

        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'slug' => 'owner', 'description' => '', 'is_active' => true]);
        $this->owner = User::create([
            'name' => 'Owner', 'email' => 'owner@test.com', 'password' => Hash::make('pw'),
            'role_id' => $role->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $cat = Category::create(['name' => 'Drinks', 'sort_order' => 0, 'is_active' => true]);
        $this->item = Item::create([
            'name' => 'Tea', 'base_price' => 10.00, 'is_active' => true, 'is_available' => true,
            'category_id' => $cat->id, 'has_variants' => false,
        ]);
    }

    private function actingAsOwner(): static
    {
        Sanctum::actingAs($this->owner, ['*']);

        return $this;
    }

    public function test_owner_can_list_variants(): void
    {
        Variant::create(['item_id' => $this->item->id, 'name' => 'Small', 'price' => 8.00, 'is_active' => true, 'sort_order' => 0]);
        Variant::create(['item_id' => $this->item->id, 'name' => 'Large', 'price' => 12.00, 'is_active' => true, 'sort_order' => 1]);

        $res = $this->actingAsOwner()->getJson("/api/items/{$this->item->id}/variants");

        $res->assertOk()->assertJsonCount(2, 'variants');
    }

    public function test_owner_can_create_variant(): void
    {
        $res = $this->actingAsOwner()->postJson("/api/items/{$this->item->id}/variants", [
            'name' => 'Large', 'price' => 14.00, 'is_active' => true,
        ]);

        $res->assertStatus(201)->assertJsonPath('variant.name', 'Large');
        $this->assertDatabaseHas('variants', ['item_id' => $this->item->id, 'name' => 'Large']);
    }

    public function test_owner_can_update_variant(): void
    {
        $v = Variant::create(['item_id' => $this->item->id, 'name' => 'Small', 'price' => 8.00, 'is_active' => true, 'sort_order' => 0]);

        $res = $this->actingAsOwner()->patchJson("/api/items/{$this->item->id}/variants/{$v->id}", [
            'price' => 9.00,
        ]);

        $res->assertOk()->assertJsonPath('variant.price', '9.00');
        $this->assertDatabaseHas('variants', ['id' => $v->id, 'price' => 9.00]);
    }

    public function test_owner_can_deactivate_variant_used_in_order(): void
    {
        $v = Variant::create(['item_id' => $this->item->id, 'name' => 'Small', 'price' => 8.00, 'is_active' => true, 'sort_order' => 0]);

        // Simulate variant used in an order — create an order first to satisfy FK
        $orderId = \DB::table('orders')->insertGetId([
            'order_number' => 'BG-TEST-001', 'type' => 'dine_in', 'status' => 'completed',
            'subtotal' => 8, 'total' => 8, 'created_at' => now(), 'updated_at' => now(),
        ]);
        \DB::table('order_items')->insert([
            'order_id' => $orderId, 'item_id' => $this->item->id, 'variant_id' => $v->id,
            'item_name' => 'Tea', 'variant_name' => 'Small', 'quantity' => 1,
            'unit_price' => 8, 'total_price' => 8,
            'status' => 'pending', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $res = $this->actingAsOwner()->deleteJson("/api/items/{$this->item->id}/variants/{$v->id}");

        $res->assertOk();
        // Should deactivate, not hard-delete, because used in an order
        $this->assertDatabaseHas('variants', ['id' => $v->id, 'is_active' => false]);
    }

    public function test_owner_can_hard_delete_unused_variant(): void
    {
        $v = Variant::create(['item_id' => $this->item->id, 'name' => 'Small', 'price' => 8.00, 'is_active' => true, 'sort_order' => 0]);

        $res = $this->actingAsOwner()->deleteJson("/api/items/{$this->item->id}/variants/{$v->id}");

        $res->assertOk();
        $this->assertDatabaseMissing('variants', ['id' => $v->id]);
    }

    public function test_item_create_with_variants_array(): void
    {
        $cat = Category::firstOrCreate(['name' => 'Drinks']);

        $res = $this->actingAsOwner()->postJson('/api/items', [
            'name' => 'Coffee', 'base_price' => 0, 'has_variants' => true,
            'category_id' => $cat->id,
            'variants' => [
                ['name' => 'Small', 'price' => 10.00, 'is_active' => true],
                ['name' => 'Large', 'price' => 15.00, 'is_active' => true],
            ],
        ]);

        $res->assertStatus(201);
        $item = Item::where('name', 'Coffee')->firstOrFail();
        $this->assertCount(2, $item->variants);
    }

    public function test_existing_simple_items_unaffected(): void
    {
        // has_variants defaults to false — simple items still work without variants
        $this->assertDatabaseHas('items', ['id' => $this->item->id, 'has_variants' => false]);
        $this->assertCount(0, $this->item->variants);
    }
}
