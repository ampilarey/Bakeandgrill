<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ComboItem;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\UnitConversion;
use App\Models\Variant;
use App\Services\RecipeCostCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Audit of item costing, 2026-09-17.
 *
 * Costing ignored the row's unit (200 g of flour priced per kilo cost 200
 * kilos), ignored the recipe's yield while stock deduction applied it, costed
 * a deleted ingredient at nothing, costed a bundle's half-size child as a
 * full, and let a typed cost beat a recorded recipe without a word.
 */
class RecipeCostingAuditTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    private InventoryItem $flour;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        // Stocked and priced per kilo.
        $this->flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 40, 'is_active' => true]);
    }

    private function recipeFor(Item $item, array $rows, float $yield = 1): Recipe
    {
        $recipe = Recipe::create(['item_id' => $item->id, 'yield_quantity' => $yield, 'total_cost' => 0]);
        foreach ($rows as $row) {
            RecipeItem::create(['recipe_id' => $recipe->id] + $row);
        }

        return $recipe;
    }

    private function costOf(Item $item): ?float
    {
        return app(RecipeCostCalculator::class)->forRecipe($item->recipe()->with('recipeItems.inventoryItem')->first());
    }

    public function test_the_everyday_metric_conversions_are_on_file(): void
    {
        $this->assertTrue(UnitConversion::where('from_unit', 'g')->where('to_unit', 'kg')->exists());
        $this->assertTrue(UnitConversion::where('from_unit', 'ml')->where('to_unit', 'l')->exists());
    }

    public function test_a_row_in_grams_is_costed_at_the_per_kilo_price(): void
    {
        $bajiya = Item::factory()->create(['name' => 'Bajiya', 'base_price' => 3, 'cost' => 0]);
        $this->recipeFor($bajiya, [['inventory_item_id' => $this->flour->id, 'quantity' => 200, 'unit' => 'g']]);

        // 200 g of MVR 40/kg flour is MVR 8, not MVR 8,000.
        $this->assertEqualsWithDelta(8.0, $this->costOf($bajiya), 0.001);

        $payload = $this->getJson("/api/items/{$bajiya->id}/recipe")->assertOk()->json('item');
        $this->assertEqualsWithDelta(8.0, $payload['recipe_cost'], 0.001);
        $this->assertEqualsWithDelta(8.0, $payload['recipe']['ingredients'][0]['line_cost'], 0.001);
        $this->assertTrue($payload['recipe']['ingredients'][0]['unit_ok']);
    }

    public function test_the_yield_divides_the_cost_as_it_divides_the_stock(): void
    {
        $bajiya = Item::factory()->create(['name' => 'Bajiya', 'cost' => 0]);
        // The rows make fifty; 2 kg of flour is 80 for the batch, 1.60 each.
        $this->recipeFor($bajiya, [['inventory_item_id' => $this->flour->id, 'quantity' => 2, 'unit' => 'kg']], yield: 50);

        $this->assertEqualsWithDelta(1.6, $this->costOf($bajiya), 0.001);
    }

    public function test_a_row_whose_unit_cannot_be_converted_is_refused_and_never_costed_as_free(): void
    {
        $bajiya = Item::factory()->create(['name' => 'Bajiya', 'cost' => 0]);

        $this->putJson("/api/items/{$bajiya->id}/recipe", [
            'ingredients' => [['inventory_item_id' => $this->flour->id, 'quantity' => 2, 'unit' => 'cups']],
        ])->assertStatus(422)->assertJsonValidationErrors('ingredients.0.unit');

        // One that predates the check is unknown, not zero.
        $this->recipeFor($bajiya, [['inventory_item_id' => $this->flour->id, 'quantity' => 2, 'unit' => 'cups']]);
        $this->assertNull($this->costOf($bajiya));
        $payload = $this->getJson("/api/items/{$bajiya->id}/recipe")->assertOk()->json('item');
        $this->assertFalse($payload['recipe']['ingredients'][0]['unit_ok']);
        $this->assertNull($payload['recipe']['ingredients'][0]['line_cost']);
    }

    public function test_csv_import_refuses_a_unit_it_cannot_convert(): void
    {
        $bajiya = Item::factory()->create(['name' => 'Bajiya', 'cost' => 0]);
        $csv = "item_id,item,category,size_id,size,ingredient_id,ingredient,quantity,unit\n"
            . "{$bajiya->id},Bajiya,,,,{$this->flour->id},Flour,2,cups\n";

        $this->postJson('/api/recipes/import.csv', ['file' => UploadedFile::fake()->createWithContent('r.csv', $csv)])
            ->assertStatus(422)
            ->assertJsonFragment(['errors' => ["Line 2: 'Flour' is stocked in kg and there is no conversion from 'cups'."]]);
    }

    public function test_a_deleted_ingredient_makes_the_cost_unknown_and_is_flagged(): void
    {
        $bajiya = Item::factory()->create(['name' => 'Bajiya', 'cost' => 0]);
        $oil = InventoryItem::create(['name' => 'Oil', 'unit' => 'l', 'unit_cost' => 30, 'is_active' => true]);
        $this->recipeFor($bajiya, [
            ['inventory_item_id' => $this->flour->id, 'quantity' => 100, 'unit' => 'g'],
            ['inventory_item_id' => $oil->id, 'quantity' => 50, 'unit' => 'ml'],
        ]);
        $oil->delete();

        $this->assertNull($this->costOf($bajiya));
        $payload = $this->getJson("/api/items/{$bajiya->id}/recipe")->assertOk()->json('item');
        $this->assertNull($payload['recipe_cost']);
        $flagged = collect($payload['recipe']['ingredients'])->firstWhere('missing_ingredient', true);
        $this->assertNotNull($flagged);
        $this->assertNull($flagged['line_cost']);
    }

    public function test_a_bundle_costs_a_half_size_child_at_the_half(): void
    {
        $bileh = Item::factory()->create(['name' => 'Bileh', 'cost' => 0, 'has_variants' => true]);
        $leaf = InventoryItem::create(['name' => 'Betel leaf', 'unit' => 'pcs', 'unit_cost' => 2, 'is_active' => true]);
        $this->recipeFor($bileh, [['inventory_item_id' => $leaf->id, 'quantity' => 1, 'unit' => 'pcs']]);
        $half = Variant::create(['item_id' => $bileh->id, 'name' => 'Half', 'price' => 3, 'consumption_factor' => 0.5, 'is_active' => true]);

        $set = Item::factory()->create(['name' => 'Snack set', 'cost' => 0, 'is_combo' => true]);
        ComboItem::create(['combo_id' => $set->id, 'item_id' => $bileh->id, 'variant_id' => $half->id, 'quantity' => 2]);

        // Two halves at MVR 1 each, not two fulls at MVR 2.
        $this->assertEqualsWithDelta(2.0, app(RecipeCostCalculator::class)->bundleCost($set), 0.001);
    }

    public function test_the_payload_names_a_manual_cost_that_overrides_the_recipe(): void
    {
        $bajiya = Item::factory()->create(['name' => 'Bajiya', 'base_price' => 3, 'cost' => 1.25]);
        $this->recipeFor($bajiya, [['inventory_item_id' => $this->flour->id, 'quantity' => 200, 'unit' => 'g']]);

        $payload = $this->getJson("/api/items/{$bajiya->id}/recipe")->assertOk()->json('item');
        $this->assertEqualsWithDelta(8.0, $payload['recipe_cost'], 0.001);
        $this->assertEqualsWithDelta(1.25, $payload['effective_cost'], 0.001);
        $this->assertEqualsWithDelta(1.25, $payload['manual_cost'], 0.001);
    }
}
