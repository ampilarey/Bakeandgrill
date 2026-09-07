<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

use App\Domains\Inventory\Services\InventoryDeductionService;
use App\Domains\Inventory\Services\RecipeStockService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\Variant;
use App\Services\RecipeCostCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-07: "water has 500ml bottles and 1.5L bottles. In menu it's
 * as one item with variants" — and each size is a different thing on the
 * shelf. A recipe row can belong to one size: the 500ml size takes one 500ml
 * bottle, the 1.5L size takes one 1.5L bottle, and neither touches the other's
 * stock. Rows with no size still work as before: shared by every size,
 * scaled by the size's "Uses" factor.
 */
class VariantRecipeRowsTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $small;

    private InventoryItem $large;

    private InventoryItem $cups;

    private Item $water;

    private Variant $v500;

    private Variant $v1500;

    private Recipe $recipe;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->small = InventoryItem::create(['name' => 'Water 500ml', 'unit' => 'pcs', 'current_stock' => 10, 'unit_cost' => 4, 'is_active' => true]);
        $this->large = InventoryItem::create(['name' => 'Water 1.5L', 'unit' => 'pcs', 'current_stock' => 3, 'unit_cost' => 9, 'is_active' => true]);
        // Something every size shares: a paper cup handed over with each bottle.
        $this->cups = InventoryItem::create(['name' => 'Paper cup', 'unit' => 'pcs', 'current_stock' => 100, 'unit_cost' => 0.5, 'is_active' => true]);

        $this->water = $this->makeItem(false, 0, ['category_id' => $this->makeCategory()->id, 'has_variants' => true, 'base_price' => 10]);
        $this->v500 = $this->water->variants()->create(['name' => '500ml', 'price' => 10, 'is_active' => true, 'sort_order' => 0, 'consumption_factor' => 1]);
        $this->v1500 = $this->water->variants()->create(['name' => '1.5L', 'price' => 20, 'is_active' => true, 'sort_order' => 1, 'consumption_factor' => 1]);

        $this->recipe = Recipe::create(['item_id' => $this->water->id, 'yield_quantity' => 1, 'limits_availability' => true, 'total_cost' => 0]);
        RecipeItem::create(['recipe_id' => $this->recipe->id, 'inventory_item_id' => $this->cups->id, 'quantity' => 1, 'unit' => 'pcs']);
        RecipeItem::create(['recipe_id' => $this->recipe->id, 'inventory_item_id' => $this->small->id, 'variant_id' => $this->v500->id, 'quantity' => 1, 'unit' => 'pcs']);
        RecipeItem::create(['recipe_id' => $this->recipe->id, 'inventory_item_id' => $this->large->id, 'variant_id' => $this->v1500->id, 'quantity' => 1, 'unit' => 'pcs']);
    }

    private function sell(Variant $variant, int $quantity): Order
    {
        $order = Order::factory()->paid()->create(['customer_id' => $this->makeCustomer()->id, 'total' => 0]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $this->water->id, 'item_name' => $this->water->name,
            'variant_id' => $variant->id, 'variant_name' => $variant->name,
            'quantity' => $quantity, 'unit_price' => (float) $variant->price, 'total_price' => $quantity * (float) $variant->price,
        ]);
        app(InventoryDeductionService::class)->deductForOrder($order->fresh());

        return $order;
    }

    public function test_each_size_takes_its_own_bottle_and_the_shared_cup(): void
    {
        $this->sell($this->v1500, 2);

        $this->assertSame(1.0, (float) $this->large->fresh()->current_stock, 'two 1.5L bottles gone');
        $this->assertSame(10.0, (float) $this->small->fresh()->current_stock, 'the 500ml shelf is untouched');
        $this->assertSame(98.0, (float) $this->cups->fresh()->current_stock, 'a cup with each bottle');

        $this->sell($this->v500, 3);
        $this->assertSame(7.0, (float) $this->small->fresh()->current_stock);
        $this->assertSame(1.0, (float) $this->large->fresh()->current_stock);
        $this->assertSame(95.0, (float) $this->cups->fresh()->current_stock);
    }

    public function test_a_size_with_its_own_row_ignores_the_uses_factor_for_that_row(): void
    {
        // Somebody set 1.5L to "uses 3" of the shared pool — three cups per
        // bottle, say. The bottle row is still one bottle.
        $this->v1500->update(['consumption_factor' => 3]);

        $this->sell($this->v1500->fresh(), 1);

        $this->assertSame(2.0, (float) $this->large->fresh()->current_stock, 'one 1.5L bottle, not three');
        $this->assertSame(97.0, (float) $this->cups->fresh()->current_stock, 'the shared cup row is scaled by the factor');
    }

    public function test_availability_is_per_size(): void
    {
        $stock = app(RecipeStockService::class);
        $item = $this->water->fresh(['recipe.recipeItems.inventoryItem', 'variants']);

        $this->assertSame(3, $stock->portionsAvailable($item, $this->v1500), 'three 1.5L bottles');
        $this->assertSame(10, $stock->portionsAvailable($item, $this->v500), 'ten 500ml bottles');
        $this->assertSame(10, $stock->portionsForItem($item), 'the dish stays on the menu while any size can be made');

        $this->large->update(['current_stock' => 0]);
        $item = $this->water->fresh(['recipe.recipeItems.inventoryItem', 'variants']);
        $this->assertSame(0, $stock->portionsAvailable($item, $this->v1500), '1.5L is sold out');
        $this->assertSame(10, $stock->portionsAvailable($item, $this->v500), '500ml still sells');
        $this->assertSame(['500ml' => 10, '1.5L' => 0], collect($stock->portionsByVariant($item))->mapWithKeys(fn ($n, $id) => [Variant::find($id)->name => $n])->all());
    }

    public function test_each_size_is_costed_on_its_own(): void
    {
        $costs = app(RecipeCostCalculator::class);
        $item = $this->water->fresh(['recipe.recipeItems.inventoryItem', 'variants']);

        // Shared cup 0.50 + its own bottle.
        $this->assertSame(4.5, $costs->effectiveCostForVariant($item, $this->v500));
        $this->assertSame(9.5, $costs->effectiveCostForVariant($item, $this->v1500));
        // The dish as a whole only knows what every size shares.
        $this->assertSame(0.5, $costs->forRecipe($item->recipe));

        $payload = $this->getJson("/api/items/{$this->water->id}/recipe")->assertOk()->json('item');
        $byName = collect($payload['variant_costs'])->keyBy('name');
        $this->assertSame(9.5, (float) $byName['1.5L']['cost']);
        $this->assertSame(10.5, (float) $byName['1.5L']['profit']);
        $this->assertSame(4.5, (float) $byName['500ml']['cost']);
        $this->assertSame($this->v1500->id, collect($payload['recipe']['ingredients'])->firstWhere('inventory_item_id', $this->large->id)['variant_id']);
    }

    public function test_the_recipe_editor_saves_rows_per_size_and_refuses_another_items_size(): void
    {
        $other = $this->makeItem(false, 0, ['category_id' => $this->makeCategory()->id, 'has_variants' => true]);
        $foreign = $other->variants()->create(['name' => 'Large', 'price' => 5, 'is_active' => true, 'sort_order' => 0]);

        $this->putJson("/api/items/{$this->water->id}/recipe", [
            'ingredients' => [
                ['inventory_item_id' => $this->cups->id, 'quantity' => 1, 'unit' => 'pcs'],
                ['inventory_item_id' => $this->small->id, 'quantity' => 1, 'unit' => 'pcs', 'variant_id' => $this->v500->id],
                ['inventory_item_id' => $this->large->id, 'quantity' => 1, 'unit' => 'pcs', 'variant_id' => $foreign->id],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors(['ingredients.2.variant_id']);

        $res = $this->putJson("/api/items/{$this->water->id}/recipe", [
            'ingredients' => [
                ['inventory_item_id' => $this->cups->id, 'quantity' => 1, 'unit' => 'pcs'],
                ['inventory_item_id' => $this->small->id, 'quantity' => 1, 'unit' => 'pcs', 'variant_id' => $this->v500->id],
                ['inventory_item_id' => $this->large->id, 'quantity' => 1, 'unit' => 'pcs', 'variant_id' => $this->v1500->id],
            ],
        ])->assertOk()->json('item');

        $rows = collect($res['recipe']['ingredients']);
        $this->assertNull($rows->firstWhere('inventory_item_id', $this->cups->id)['variant_id']);
        $this->assertSame('1.5L', $rows->firstWhere('inventory_item_id', $this->large->id)['variant']['name']);
        $this->assertCount(2, $res['variants']);
    }

    public function test_a_recipe_with_only_shared_rows_behaves_exactly_as_before(): void
    {
        RecipeItem::where('recipe_id', $this->recipe->id)->whereNotNull('variant_id')->delete();
        $this->v1500->update(['consumption_factor' => 2]);

        $this->sell($this->v1500->fresh(), 1);
        $this->assertSame(98.0, (float) $this->cups->fresh()->current_stock, 'uses 2 → two cups');
        $this->assertSame(3.0, (float) $this->large->fresh()->current_stock);

        $item = $this->water->fresh(['recipe.recipeItems.inventoryItem', 'variants']);
        $this->assertSame(1.0, app(RecipeCostCalculator::class)->effectiveCostForVariant($item, $this->v1500->fresh()));
    }
}
