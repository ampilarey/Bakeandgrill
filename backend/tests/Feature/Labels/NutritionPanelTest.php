<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The nutrition panel (round C, 2026-10-12): per 100 g from the recipe,
 * printed on the full sticker when the item asks; a custom label types its line.
 */
class NutritionPanelTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    private InventoryItem $flour;

    private InventoryItem $tuna;

    private InventoryItem $salt;

    private Recipe $recipe;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true, 'label_shelf_life_days' => 90]);
        $this->flour = $this->inventory('Flour');
        $this->tuna = $this->inventory('Smoked tuna');
        $this->salt = $this->inventory('Salt');
        $this->recipe = Recipe::create(['item_id' => $this->bajiya->id, 'yield_quantity' => 1, 'limits_availability' => false, 'total_cost' => 0]);
        RecipeItem::create(['recipe_id' => $this->recipe->id, 'inventory_item_id' => $this->flour->id, 'quantity' => 500, 'unit' => 'g']);
        RecipeItem::create(['recipe_id' => $this->recipe->id, 'inventory_item_id' => $this->tuna->id, 'quantity' => 200, 'unit' => 'g']);
        RecipeItem::create(['recipe_id' => $this->recipe->id, 'inventory_item_id' => $this->salt->id, 'quantity' => 5, 'unit' => 'g']);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function inventory(string $name, string $unit = 'g'): InventoryItem
    {
        return InventoryItem::create(['name' => $name, 'sku' => strtoupper(substr(md5($name), 0, 8)), 'unit' => $unit, 'current_stock' => 100, 'reorder_point' => 0, 'unit_cost' => 1, 'is_active' => true]);
    }

    private function values(): void
    {
        $this->putJson("/api/labels/nutrition/{$this->flour->id}", ['kcal' => 364, 'fat' => 1, 'sat_fat' => 0.2, 'carbs' => 76, 'sugars' => 0.3, 'protein' => 10, 'salt' => 0])->assertOk();
        $this->putJson("/api/labels/nutrition/{$this->tuna->id}", ['kcal' => 132, 'fat' => 1.3, 'sat_fat' => 0.4, 'protein' => 29, 'salt' => 1.5])->assertOk();
        $this->putJson("/api/labels/nutrition/{$this->salt->id}", ['kcal' => 0, 'salt' => 100])->assertOk();
    }

    private function sheet(array $body): string
    {
        $res = $this->postJson('/api/labels/stickers/url', $body)->assertOk();

        return (string) $this->get($res->json('view_url'))->assertOk()->getContent();
    }

    public function test_the_panel_is_worked_out_per_100_g_once_every_ingredient_in_the_recipe_has_values(): void
    {
        $this->getJson("/api/labels/items/{$this->bajiya->id}")->assertOk()
            ->assertJsonPath('data.nutrition.complete', false)
            ->assertJsonPath('data.nutrition.missing', ['Flour', 'Smoked tuna', 'Salt'])
            ->assertJsonPath('data.label_show_nutrition', false);

        $this->putJson("/api/labels/nutrition/{$this->flour->id}", ['kcal' => 364, 'fat' => 1, 'sat_fat' => 0.2, 'carbs' => 76, 'sugars' => 0.3, 'protein' => 10, 'salt' => 0])->assertOk()
            ->assertJsonPath('data.nutrition.kcal', 364)
            ->assertJsonPath('data.nutrition.carbs', 76);
        // Blank values are nought; only the energy must be typed.
        $this->putJson("/api/labels/nutrition/{$this->tuna->id}", ['kcal' => 132, 'fat' => 1.3, 'sat_fat' => 0.4, 'protein' => 29, 'salt' => 1.5])->assertOk()
            ->assertJsonPath('data.nutrition.carbs', 0);
        $this->getJson("/api/labels/items/{$this->bajiya->id}")->assertOk()
            ->assertJsonPath('data.nutrition.complete', false)
            ->assertJsonPath('data.nutrition.missing', ['Salt']);

        $this->putJson("/api/labels/nutrition/{$this->salt->id}", ['kcal' => 0, 'salt' => 100])->assertOk();
        // 500 g flour, 200 g tuna, 5 g salt = 705 g: 2084 kcal → 296 per 100 g, and so on.
        $this->getJson("/api/labels/items/{$this->bajiya->id}")->assertOk()
            ->assertJsonPath('data.nutrition.complete', true)
            ->assertJsonPath('data.nutrition.grams', 705)
            ->assertJsonPath('data.nutrition.per100.kcal', 296)
            ->assertJsonPath('data.nutrition.per100.fat', 1.1)
            ->assertJsonPath('data.nutrition.per100.carbs', 53.9)
            ->assertJsonPath('data.nutrition.per100.protein', 15.3)
            ->assertJsonPath('data.nutrition.per100.salt', 1.1);

        // The settings card: each ingredient with its values and who uses it, each product's standing.
        $card = $this->getJson('/api/labels/nutrition')->assertOk()->json();
        $this->assertSame(['Flour', 'Salt', 'Smoked tuna'], array_column($card['data'], 'name'));
        $this->assertSame(['Bajiya'], $card['data'][0]['used_by']);
        $this->assertSame(364.0, (float) $card['data'][0]['nutrition']['kcal']);
        $this->assertSame('Bajiya', $card['products'][0]['name']);
        $this->assertTrue($card['products'][0]['complete']);
        $this->assertFalse($card['products'][0]['show']);
        $this->assertArrayHasKey('kcal', $card['fields']);

        // An ingredient measured in pieces has no weight in grams: the panel waits for it.
        RecipeItem::create(['recipe_id' => $this->recipe->id, 'inventory_item_id' => $this->inventory('Egg', 'pcs')->id, 'quantity' => 2, 'unit' => 'pcs']);
        $this->getJson("/api/labels/items/{$this->bajiya->id}")->assertOk()
            ->assertJsonPath('data.nutrition.complete', false)
            ->assertJsonPath('data.nutrition.unweighed', ['Egg']);
    }

    public function test_the_panel_prints_on_the_full_sticker_when_the_item_asks_and_a_custom_label_types_its_line(): void
    {
        $this->values();
        $one = ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4'];
        $this->assertStringNotContainsString('>ENERGY<', $this->sheet($one), 'off until the item switches it on');

        $this->putJson("/api/items/{$this->bajiya->id}/label", ['label_show_nutrition' => true])->assertOk()->assertJsonPath('data.label_show_nutrition', true);
        $html = $this->sheet($one);
        foreach (['>ENERGY<', '>296 kcal<', '>FAT<', '>1.1 g<', '>CARBS<', '>53.9 g<', '>PROTEIN<', '>15.3 g<', '>SALT<'] as $needle) {
            $this->assertStringContainsString($needle, $html);
        }
        $this->assertStringContainsString('N U T R I T I O N', $html, 'the spaced heading');
        $this->assertStringNotContainsString('>ENERGY<', $this->sheet(array_merge($one, ['layout' => 'a4-8'])), 'the compact sticker has no room for the panel');

        // Switched on but a value missing: nothing half-right prints.
        $this->salt->forceFill(['nutrition' => null])->save();
        $this->assertStringNotContainsString('>ENERGY<', $this->sheet($one));

        // A custom label prints the line it types, fitted to one line.
        $id = $this->postJson('/api/labels/custom', ['name' => 'Peanut Sauce', 'label_nutrition' => 'Energy 500 kcal · Fat 40 g · Protein 20 g'])->assertCreated()
            ->assertJsonPath('data.label_nutrition', 'Energy 500 kcal · Fat 40 g · Protein 20 g')->json('data.id');
        $html = $this->sheet(['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'a4-4']);
        $this->assertStringContainsString('>Energy 500 kcal · Fat 40 g · Protein 20 g<', $html);
        $this->assertStringNotContainsString('N U T R I T I O N', $html, 'the typed line says what it is; no heading');
    }

    public function test_values_are_checked_and_can_be_cleared(): void
    {
        $this->putJson("/api/labels/nutrition/{$this->flour->id}", ['fat' => 2])->assertStatus(422)
            ->assertJsonPath('message', 'Type the energy (kcal) per 100 g; the rest may stay blank.');
        $this->putJson("/api/labels/nutrition/{$this->flour->id}", ['kcal' => 'lots'])->assertUnprocessable();
        $this->putJson("/api/labels/nutrition/{$this->flour->id}", ['kcal' => 2000])->assertUnprocessable();
        $this->putJson("/api/labels/nutrition/{$this->flour->id}", ['kcal' => 364, 'fat' => 120])->assertUnprocessable();

        $this->putJson("/api/labels/nutrition/{$this->flour->id}", ['kcal' => 364])->assertOk()->assertJsonPath('data.nutrition.kcal', 364);
        $this->assertSame(364.0, (float) $this->flour->refresh()->nutrition['kcal']);
        $this->putJson("/api/labels/nutrition/{$this->flour->id}", ['kcal' => '', 'fat' => ''])->assertOk()->assertJsonPath('data.nutrition', null);
        $this->assertNull($this->flour->refresh()->nutrition);
    }
}
