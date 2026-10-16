<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelIngredients;
use App\Domains\Labels\StickerSheet;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\LabelJob;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\Variant;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Label audit, 2026-10-16 (Batch A): a sized item prints its own size's price
 * and recipe, Print again dates stickers as the saved label chooses, and the
 * per-serving column is signed with the rest of the legal wording.
 */
class LabelAccuracyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-04 09:00:00');
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function inventory(string $name): InventoryItem
    {
        return InventoryItem::create(['name' => $name, 'sku' => strtoupper(substr(md5($name), 0, 8)), 'unit' => 'g', 'current_stock' => 100, 'reorder_point' => 0, 'unit_cost' => 1, 'is_active' => true]);
    }

    /** @return array{0: Item, 1: Variant, 2: Variant} */
    private function juice(): array
    {
        $juice = $this->makeItem(false, 0, ['name' => 'Mango juice', 'label_enabled' => true, 'label_show_price' => true, 'has_variants' => true, 'base_price' => 0, 'label_shelf_life_days' => 3]);
        $small = Variant::create(['item_id' => $juice->id, 'name' => 'Small', 'price' => 15, 'is_active' => true, 'sort_order' => 1]);
        $large = Variant::create(['item_id' => $juice->id, 'name' => 'Large', 'price' => 25, 'is_active' => true, 'sort_order' => 2]);
        $recipe = Recipe::create(['item_id' => $juice->id, 'yield_quantity' => 1, 'limits_availability' => false, 'total_cost' => 0]);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $this->inventory('Mango')->id, 'variant_id' => $small->id, 'quantity' => 200, 'unit' => 'g']);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $this->inventory('Alphonso mango')->id, 'variant_id' => $large->id, 'quantity' => 400, 'unit' => 'g']);

        return [$juice, $small, $large];
    }

    public function test_a_sized_item_prints_the_picked_sizes_price_and_recipe(): void
    {
        [$juice, $small, $large] = $this->juice();
        $sheet = app(StickerSheet::class);
        $ingredients = app(LabelIngredients::class);

        $big = $sheet->forSize($juice, ['size' => $large->id]);
        $this->assertSame('MVR 25.00', $sheet->price($big));
        $this->assertSame('Alphonso mango', $ingredients->forItem($big)['en']);
        $this->assertSame('own', $ingredients->sizeRecipe($big));
        $this->assertSame('Mango', $ingredients->forItem($sheet->forSize($juice, ['size' => $small->id]))['en']);

        // No size picked: the cheapest is a "from" price, said so.
        $this->assertSame('From MVR 15.00', $sheet->price($juice));
        // A typed label price still wins over the size.
        $juice->forceFill(['label_price' => 30])->save();
        $this->assertSame('MVR 30.00', $sheet->price($sheet->forSize($juice->fresh(), ['size' => $large->id])));

        // Through the API: the size goes on the row, the summary says which, and two sizes are two rows.
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [
            ['id' => $juice->id, 'copies' => 2, 'size' => $large->id],
            ['id' => $juice->id, 'copies' => 3, 'size' => $small->id],
        ], 'layout' => 'a4-8', 'fill' => true, 'mfg' => '2026-10-04'])->assertOk();
        $this->assertSame(['id' => $large->id, 'name' => 'Large'], $res->json('summary.products.0.size'));
        $this->assertSame(['id' => $small->id, 'name' => 'Small'], $res->json('summary.products.1.size'));
        $this->assertSame(5, $res->json('summary.stickers'));
    }

    public function test_a_size_without_its_own_rows_uses_the_shared_recipe_and_says_so(): void
    {
        [$juice, , $large] = $this->juice();
        $extra = Variant::create(['item_id' => $juice->id, 'name' => 'Jug', 'price' => 60, 'is_active' => true, 'sort_order' => 3]);
        RecipeItem::create(['recipe_id' => $juice->recipe()->first()->id, 'inventory_item_id' => $this->inventory('Water')->id, 'quantity' => 100, 'unit' => 'g']);
        $sheet = app(StickerSheet::class);
        $jug = $sheet->forSize($juice, ['size' => $extra->id]);
        $this->assertSame('shared', app(LabelIngredients::class)->sizeRecipe($jug));
        $this->assertSame('Water', app(LabelIngredients::class)->forItem($jug)['en']);
        $this->assertSame('own', app(LabelIngredients::class)->sizeRecipe($sheet->forSize($juice, ['size' => $large->id])));
    }

    public function test_print_again_keeps_or_recomputes_the_use_by_as_the_label_chooses(): void
    {
        $bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 5]);
        $job = $this->postJson('/api/labels/stickers/url', [
            'items' => [['id' => $bajiya->id, 'copies' => 4]], 'layout' => 'a4-8', 'fill' => true, 'mfg' => '2026-10-04', 'exp' => '2026-10-09',
        ])->assertOk()->json('job');
        // A typed use-by defaults to Keep.
        $this->assertSame('keep', $this->getJson('/api/labels/jobs')->json('data.0.dates'));

        CarbonImmutable::setTestNow('2026-10-06 09:00:00');
        $kept = $this->postJson("/api/labels/jobs/{$job['id']}/print")->assertOk();
        $this->assertSame('2026-10-06', $kept->json('summary.products.0.mfg'));
        $this->assertSame('2026-10-09', $kept->json('summary.products.0.exp'));

        // Shelf life from today: the use-by moves with made-on.
        $this->putJson("/api/labels/jobs/{$job['id']}", ['dates' => 'shelf'])->assertOk()->assertJsonPath('data.dates', 'shelf');
        $fresh = $this->postJson("/api/labels/jobs/{$job['id']}/print")->assertOk();
        $this->assertSame('2026-10-06', $fresh->json('summary.products.0.mfg'));
        $this->assertSame('2026-10-11', $fresh->json('summary.products.0.exp'));

        // Keep, once the date has passed, is refused with the date.
        $this->putJson("/api/labels/jobs/{$job['id']}", ['dates' => 'keep'])->assertOk();
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        $this->postJson("/api/labels/jobs/{$job['id']}/print")->assertUnprocessable()
            ->assertJsonPath('message', 'This label keeps its use-by date, 9 Oct 2026, which has passed. Switch it to Shelf life from today, or edit the label with a new date.');
    }

    public function test_a_variable_run_moves_every_row_to_today(): void
    {
        $bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 5]);
        $patties = $this->makeItem(false, 0, ['name' => 'Patties', 'label_enabled' => true, 'label_shelf_life_days' => 2]);
        $job = $this->postJson('/api/labels/stickers/url', [
            'items' => [
                ['id' => $bajiya->id, 'copies' => 2, 'mfg' => '2026-10-03', 'exp' => '2026-10-07'],
                ['id' => $patties->id, 'copies' => 2, 'mfg' => '2026-10-04'],
            ], 'layout' => 'a4-8', 'fill' => true, 'mfg' => '2026-10-04',
        ])->assertOk()->json('job');
        $this->putJson("/api/labels/jobs/{$job['id']}", ['dates' => 'shelf'])->assertOk();

        CarbonImmutable::setTestNow('2026-10-06 09:00:00');
        $re = $this->postJson("/api/labels/jobs/{$job['id']}/print")->assertOk();
        $this->assertSame(['2026-10-06', '2026-10-11'], [$re->json('summary.products.0.mfg'), $re->json('summary.products.0.exp')]);
        $this->assertSame(['2026-10-06', '2026-10-08'], [$re->json('summary.products.1.mfg'), $re->json('summary.products.1.exp')]);
        $this->assertSame('shelf', LabelJob::dateMode(LabelJob::query()->find($job['id'])->request));
    }

    public function test_a_label_without_a_typed_use_by_still_works_it_out_from_today(): void
    {
        $bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90]);
        $job = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $bajiya->id, 'copies' => 1]], 'layout' => 'a4-8', 'fill' => true, 'mfg' => '2026-10-04'])->assertOk()->json('job');
        $this->assertSame('shelf', $this->getJson('/api/labels/jobs')->json('data.0.dates'));
        CarbonImmutable::setTestNow('2026-10-11 09:00:00');
        $this->postJson("/api/labels/jobs/{$job['id']}/print")->assertOk()
            ->assertJsonPath('summary.products.0.mfg', '2026-10-11')
            ->assertJsonPath('summary.products.0.exp', '2027-01-09');
    }

    public function test_a_new_serving_size_changes_the_signed_wording(): void
    {
        $bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_show_nutrition' => true, 'label_serving_g' => 50]);
        $flour = $this->inventory('Flour');
        $flour->forceFill(['nutrition' => ['kcal' => 364, 'fat' => 1, 'sat_fat' => 0.2, 'carbs' => 76, 'sugars' => 0.3, 'protein' => 10, 'salt' => 0]])->save();
        $recipe = Recipe::create(['item_id' => $bajiya->id, 'yield_quantity' => 1, 'limits_availability' => false, 'total_cost' => 0]);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $flour->id, 'quantity' => 100, 'unit' => 'g']);

        $signoffs = app(\App\Domains\Labels\LabelSignoffs::class);
        $before = $signoffs->lines($bajiya->fresh());
        $this->assertStringContainsString('Per serving (50 g)', $before['nutrition']);

        $bajiya->forceFill(['label_serving_g' => 80])->save();
        $after = $signoffs->lines($bajiya->fresh());
        $this->assertStringContainsString('Per serving (80 g)', $after['nutrition']);
        $this->assertNotSame(\App\Domains\Labels\LabelSignoffs::hash($before), \App\Domains\Labels\LabelSignoffs::hash($after));
    }
}
