<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelSettings;
use App\Domains\Labels\Nutrition;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\RecipeItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Round 15 of the usability work (owner, 2026-10-13: "nutrition per serving
 * beside per 100 g, and a shelf-life suggestion by storage type"): an item's
 * serving size prints a per-serving value under each per-100 g one, and the
 * layouts carry a shelf life to suggest for each storage.
 */
class ServingAndShelfLifeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        Cache::flush();
    }

    public function test_per_serving_values_are_the_per_100_values_scaled_and_print_beside_them(): void
    {
        $this->assertSame(['kcal' => 89.0, 'fat' => 3.6, 'salt' => 0.4], Nutrition::scaled(['kcal' => 296.0, 'fat' => 12.0, 'salt' => 1.2], 30.0));
        $this->assertSame('30 g', Nutrition::servingWords(30.0, 'g'));
        $this->assertSame('12.5 ml', Nutrition::servingWords(12.5, 'ml'));

        $flour = InventoryItem::create(['name' => 'Flour', 'sku' => 'FLOUR001', 'unit' => 'g', 'current_stock' => 100, 'reorder_point' => 0, 'unit_cost' => 1, 'is_active' => true]);
        $flour->forceFill(['nutrition' => ['kcal' => 364, 'fat' => 1, 'sat_fat' => 0.2, 'carbs' => 76, 'sugars' => 0.3, 'protein' => 10, 'salt' => 0]])->save();
        $item = $this->makeItem(false, 0, ['name' => 'Roshi', 'label_enabled' => true, 'label_show_nutrition' => true]);
        $recipe = Recipe::create(['item_id' => $item->id, 'yield_quantity' => 1, 'limits_availability' => false, 'total_cost' => 0]);
        RecipeItem::query()->create(['recipe_id' => $recipe->id, 'inventory_item_id' => $flour->id, 'quantity' => 100, 'unit' => 'g']);

        $this->putJson("/api/items/{$item->id}/label", ['label_serving_g' => 0])->assertUnprocessable();
        $this->putJson("/api/items/{$item->id}/label", ['label_serving_g' => 45])->assertOk()->assertJsonPath('data.label_serving_g', 45);
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $item->id, 'copies' => 1]], 'layout' => 'a4-4'])->assertOk();
        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        $this->assertStringContainsString('PER SERVING (45 g)', $html);
        $this->assertStringContainsString('364 kcal', $html);
        $this->assertStringContainsString('164 kcal', $html, '364 × 45 / 100, rounded');
        // A wrap label shows both columns under one heading.
        $wrap = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $item->id, 'copies' => 1]], 'layout' => 'single-custom', 'w' => 180, 'h' => 40])->assertOk();
        $this->assertStringContainsString('PER 100 g | PER 45 g', (string) $this->get($wrap->json('view_url'))->assertOk()->getContent());

        // Cleared, the panel is per 100 g alone.
        $this->putJson("/api/items/{$item->id}/label", ['label_serving_g' => null])->assertOk()->assertJsonPath('data.label_serving_g', null);
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $item->id, 'copies' => 1]], 'layout' => 'a4-4'])->assertOk();
        $this->assertStringNotContainsString('PER SERVING', (string) $this->get($res->json('view_url'))->assertOk()->getContent());
    }

    public function test_the_layouts_carry_a_shelf_life_to_suggest_for_each_storage(): void
    {
        $this->getJson('/api/labels/layouts')->assertOk()
            ->assertJsonPath('shelf_life.frozen.days', 90)
            ->assertJsonPath('shelf_life.chilled.days', 3)
            ->assertJsonPath('shelf_life.ambient.days', 2);
        $this->assertSame(LabelSettings::STORAGES, array_keys(LabelSettings::SHELF_LIFE_SUGGESTED));
    }
}
