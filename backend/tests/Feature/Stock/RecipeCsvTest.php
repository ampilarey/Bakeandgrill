<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\RecipeItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-07: most dishes still have no recipe. The grid says which
 * ("Stock link: Not linked"), the CSV lets them be filled in from a
 * spreadsheet and imported back in one go.
 */
class RecipeCsvTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $flour;

    private InventoryItem $small;

    private Item $bajiya;

    private Item $water;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'current_stock' => 10, 'unit_cost' => 20, 'is_active' => true]);
        $this->small = InventoryItem::create(['name' => 'Water 500ml', 'unit' => 'pcs', 'current_stock' => 10, 'unit_cost' => 4, 'is_active' => true]);

        $cat = $this->makeCategory();
        $this->bajiya = $this->makeItem(false, 0, ['category_id' => $cat->id, 'name' => 'Bajiya', 'base_price' => 5]);
        $this->water = $this->makeItem(false, 0, ['category_id' => $cat->id, 'name' => 'Water', 'has_variants' => true, 'base_price' => 10]);
        $this->water->variants()->create(['name' => '500ml', 'price' => 10, 'is_active' => true, 'sort_order' => 0]);
    }

    private function upload(string $csv, bool $dryRun = false)
    {
        return $this->post('/api/recipes/import.csv', [
            'file' => UploadedFile::fake()->createWithContent('recipes.csv', $csv),
            'dry_run' => $dryRun ? 1 : 0,
        ], ['Accept' => 'application/json']);
    }

    public function test_the_admin_list_says_how_each_dish_reaches_stock(): void
    {
        $recipe = Recipe::create(['item_id' => $this->bajiya->id, 'yield_quantity' => 1, 'total_cost' => 0]);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $this->flour->id, 'quantity' => 0.1, 'unit' => 'kg']);
        $counted = $this->makeItem(true, 5, ['category_id' => $this->bajiya->category_id, 'name' => 'Cake slice']);

        $rows = collect($this->getJson('/api/items?per_page=100')->assertOk()->json('data'))->keyBy('name');

        $this->assertSame('recipe', $rows['Bajiya']['stock_link']);
        $this->assertSame(1, $rows['Bajiya']['recipe_rows']);
        $this->assertSame('counted', $rows['Cake slice']['stock_link']);
        $this->assertSame('none', $rows['Water']['stock_link']);
    }

    public function test_export_lists_every_dish_with_a_blank_row_for_the_unlinked_ones(): void
    {
        $recipe = Recipe::create(['item_id' => $this->bajiya->id, 'yield_quantity' => 1, 'total_cost' => 0]);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $this->flour->id, 'quantity' => 0.1, 'unit' => 'kg']);

        $res = $this->get('/api/recipes/export.csv')->assertOk();
        $lines = array_map('str_getcsv', array_filter(explode("\n", $res->streamedContent())));

        $this->assertSame(['item_id', 'item', 'category', 'size_id', 'size', 'ingredient_id', 'ingredient', 'quantity', 'unit'], $lines[0]);
        $byItem = collect(array_slice($lines, 1))->groupBy(1);
        $this->assertSame([(string) $this->flour->id, 'Flour', '0.1', 'kg'], array_slice($byItem['Bajiya'][0], 5));
        $this->assertSame(['', '', '', '', '', ''], array_slice($byItem['Water'][0], 3), 'a dish with no recipe still appears, blank');
    }

    public function test_import_replaces_the_recipes_of_the_dishes_in_the_file_and_leaves_the_rest(): void
    {
        $recipe = Recipe::create(['item_id' => $this->bajiya->id, 'yield_quantity' => 1, 'total_cost' => 0]);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $this->flour->id, 'quantity' => 0.1, 'unit' => 'kg']);
        $size = $this->water->variants()->first();

        // Water by name (no ids), size by name; Bajiya untouched.
        $csv = "item_id,item,category,size_id,size,ingredient_id,ingredient,quantity,unit\n"
            . ",Water,,,500ml,,Water 500ml,1,pcs\n";

        $dry = $this->upload($csv, true)->assertOk()->json();
        $this->assertTrue($dry['dry_run']);
        $this->assertSame(1, $dry['items']);
        $this->assertSame(0, RecipeItem::whereHas('recipe', fn ($q) => $q->where('item_id', $this->water->id))->count(), 'a dry run writes nothing');

        $res = $this->upload($csv)->assertOk()->json();
        $this->assertSame([['item_id' => $this->water->id, 'item' => 'Water', 'rows_before' => 0, 'rows_after' => 1]], $res['changes']);

        $rows = Recipe::where('item_id', $this->water->id)->firstOrFail()->recipeItems;
        $this->assertCount(1, $rows);
        $this->assertSame($this->small->id, $rows[0]->inventory_item_id);
        $this->assertSame($size->id, $rows[0]->variant_id);
        $this->assertSame(1.0, (float) $rows[0]->quantity);
        $this->assertSame(1, $recipe->fresh()->recipeItems()->count(), 'Bajiya was not in the file');

        // A blank row for a dish clears it.
        $this->upload("item_id,item,size_id,size,ingredient_id,ingredient,quantity,unit\n{$this->bajiya->id},Bajiya,,,,,,\n")->assertOk();
        $this->assertSame(0, $recipe->fresh()->recipeItems()->count());
    }

    public function test_one_bad_line_saves_nothing(): void
    {
        $csv = "item_id,item,size_id,size,ingredient_id,ingredient,quantity,unit\n"
            . "{$this->bajiya->id},Bajiya,,,{$this->flour->id},Flour,0.1,kg\n"
            . "{$this->water->id},Water,,Large,{$this->small->id},Water 500ml,1,pcs\n"
            . "{$this->water->id},Water,,,,Sugar,1,kg\n"
            . "{$this->water->id},Water,,,{$this->small->id},,abc,pcs\n";

        $res = $this->upload($csv)->assertStatus(422)->json();
        $this->assertCount(3, $res['errors']);
        $this->assertStringContainsString("no size 'Large'", $res['errors'][0]);
        $this->assertStringContainsString("no stock item matches 'Sugar'", $res['errors'][1]);
        $this->assertStringContainsString("quantity 'abc'", $res['errors'][2]);
        $this->assertSame(0, RecipeItem::count());
    }

    public function test_recipes_csv_needs_the_recipes_permission(): void
    {
        Sanctum::actingAs($this->makeStaff(), ['staff']);
        $this->get('/api/recipes/export.csv')->assertForbidden();
        $this->upload("item_id\n1\n")->assertForbidden();
    }
}
