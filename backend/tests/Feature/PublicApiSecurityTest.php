<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\RecipeItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicApiSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $category = Category::create([
            'name' => 'Food',
            'slug' => 'food',
            'is_active' => true,
        ]);

        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Secret Recipe Burger',
            'sku' => 'BURGER-001',
            'base_price' => 75.00,
            'cost' => 25.00, // Internal cost - should NOT be exposed
            'is_active' => true,
            'is_available' => true,
        ]);

        // Create recipe (internal data)
        $recipe = Recipe::create([
            'item_id' => $this->item->id,
            'yield_quantity' => 1,
            'yield_unit' => 'serving',
        ]);

        $inventoryItem = InventoryItem::create([
            'name' => 'Secret Sauce',
            'sku' => 'SAUCE-001',
            'unit' => 'ml',
            'current_stock' => 1000,
            'unit_cost' => 5.00,
        ]);

        RecipeItem::create([
            'recipe_id' => $recipe->id,
            'inventory_item_id' => $inventoryItem->id,
            'quantity' => 50, // Secret quantity - should NOT be exposed
            'unit' => 'ml',
        ]);
    }

    /** @test */
    public function public_item_endpoint_does_not_expose_recipe()
    {
        $response = $this->getJson("/api/items/{$this->item->id}");

        $response->assertStatus(200);
        $item = $response->json('item');

        // Should have public data
        $this->assertEquals('Secret Recipe Burger', $item['name']);
        $this->assertEquals(75.00, $item['base_price']);

        // Should NOT have recipe data
        $this->assertArrayNotHasKey('recipe', $item);
        $this->assertArrayNotHasKey('cost', $item); // Internal cost hidden
    }

    /** @test */
    public function public_item_endpoint_does_not_expose_cost()
    {
        $response = $this->getJson("/api/items/{$this->item->id}");

        $response->assertStatus(200);
        $responseData = $response->json();

        // Ensure cost is not in the response at any level
        $this->assertStringNotContainsString('cost', json_encode($responseData));
        $this->assertStringNotContainsString('25.00', json_encode($responseData)); // The cost value
    }

    /** @test */
    public function public_items_list_does_not_expose_recipe()
    {
        $response = $this->getJson('/api/items?available_only=1');

        $response->assertStatus(200);
        $items = $response->json('data');

        $this->assertGreaterThan(0, count($items));

        foreach ($items as $item) {
            $this->assertArrayNotHasKey('recipe', $item);
            $this->assertArrayNotHasKey('recipeItems', $item);
            $this->assertArrayNotHasKey('cost', $item);
        }
    }

    /** @test */
    public function staff_can_access_recipe_via_dedicated_endpoint()
    {
        $staff = \App\Models\User::factory()->create();
        $token = $staff->createToken('staff', ['staff'])->plainTextToken;

        $response = $this->getJson("/api/items/{$this->item->id}/recipe", [
            'Authorization' => "Bearer {$token}",
        ]);

        $response->assertStatus(200);
        $item = $response->json('item');

        // Staff endpoint should include recipe
        $this->assertArrayHasKey('recipe', $item);
        $this->assertNotNull($item['recipe']);
    }
}
