<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelIngredients;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\LabelGlossaryEntry;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The ingredient glossary (2026-10-12): English → Dhivehi, so a recipe's
 * inventory names and a typed list print a Dhivehi ingredients line.
 */
class IngredientGlossaryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
    }

    private function inventory(string $name, ?string $dv = null): InventoryItem
    {
        return InventoryItem::create(['name' => $name, 'name_dv' => $dv, 'sku' => strtoupper(substr(md5($name), 0, 8)), 'unit' => 'g', 'current_stock' => 100, 'reorder_point' => 0, 'unit_cost' => 1, 'is_active' => true]);
    }

    public function test_a_recipe_prints_its_dhivehi_from_the_glossary_where_the_inventory_has_none(): void
    {
        $item = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_enabled' => true]);
        $recipe = Recipe::create(['item_id' => $item->id, 'yield_quantity' => 1, 'limits_availability' => false, 'total_cost' => 0]);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $this->inventory('Flour')->id, 'quantity' => 500, 'unit' => 'g']);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $this->inventory('Smoked tuna')->id, 'quantity' => 200, 'unit' => 'g']);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $this->inventory('Salt', 'ލޮނު')->id, 'quantity' => 5, 'unit' => 'g']);

        $this->getJson("/api/labels/items/{$item->id}")->assertOk()
            ->assertJsonPath('data.ingredients.en', 'Flour, smoked tuna, salt')
            ->assertJsonPath('data.ingredients.dv', 'ފުށް، ވަޅޯމަސް، ލޮނު')
            ->assertJsonPath('data.ingredients.dv_from', 'glossary');

        // A word the glossary does not know leaves the Dhivehi line off, and the card asks for it.
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $this->inventory('Dragon spice')->id, 'quantity' => 2, 'unit' => 'g']);
        $this->getJson("/api/labels/items/{$item->id}")->assertOk()->assertJsonPath('data.ingredients.dv', '')->assertJsonPath('data.ingredients.dv_from', '');
        $missing = $this->getJson('/api/labels/glossary')->assertOk()->json('missing');
        $this->assertSame([['word' => 'dragon spice', 'products' => ['Bajiya']]], $missing);

        $this->postJson('/api/labels/glossary', ['en' => 'Dragon Spice', 'dv' => 'ޑްރެގަން ސްޕައިސް'])->assertCreated()
            ->assertJsonPath('data.word', 'dragon spice');
        $this->getJson("/api/labels/items/{$item->id}")->assertOk()->assertJsonPath('data.ingredients.dv', 'ފުށް، ވަޅޯމަސް، ލޮނު، ޑްރެގަން ސްޕައިސް');
        $this->assertSame([], $this->getJson('/api/labels/glossary')->json('missing'));

        // The Dhivehi sticker prints the line.
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $item->id, 'copies' => 1]], 'lang' => 'dv', 'layout' => 'a4-4'])->assertOk();
        $this->assertStringContainsString('ވަޅޯމަސް', (string) $this->get($res->json('view_url'))->assertOk()->getContent());
    }

    public function test_a_typed_list_translates_through_the_glossary_with_plurals_and_asides(): void
    {
        $this->assertSame(['dv' => 'ފުށް، ލޮނު، ތެޔޮ، ބިސް، ކެރެޓް', 'missing' => [], 'parts' => ['flour', 'salt', 'oil', 'egg', 'carrots']], LabelIngredients::translate('Flour, salt and oil, Egg (free range), carrots.'), 'the plural finds the singular');
        $this->assertSame(['lupin'], LabelIngredients::translate('Flour, lupin')['missing']);
        $this->assertSame('', LabelIngredients::translate('Flour, lupin')['dv'], 'a half list misleads');
        $this->assertSame('ޓޮމާޓޯ', LabelGlossaryEntry::lookup('Fresh Tomatoes'));

        $item = $this->makeItem(false, 0, ['name' => 'Patties', 'label_enabled' => true, 'label_ingredients_source' => 'manual', 'label_ingredients' => 'Flour, potatoes, onion, chilli, oil']);
        $this->getJson("/api/labels/items/{$item->id}")->assertOk()
            ->assertJsonPath('data.ingredients.dv', 'ފުށް، އަލުވި، ފިޔާ، މިރުސް، ތެޔޮ')
            ->assertJsonPath('data.ingredients.dv_from', 'glossary');
        // Typed Dhivehi wins over the glossary.
        $this->putJson("/api/items/{$item->id}/label", ['label_ingredients_dv' => 'އަމިއްލަ ލިސްޓު'])->assertOk()
            ->assertJsonPath('data.ingredients.dv', 'އަމިއްލަ ލިސްޓު')
            ->assertJsonPath('data.ingredients.dv_from', 'typed');

        // A custom label's typed list too.
        $id = $this->postJson('/api/labels/custom', ['name' => 'Garlic Sauce', 'label_ingredients' => 'Garlic, oil, lime'])->assertCreated()->json('data.id');
        $row = collect($this->getJson('/api/labels/custom')->json('data'))->firstWhere('id', $id);
        $this->assertSame('ލޮނުމެދު، ތެޔޮ، ލުނބޯ', $row['ingredients']['dv']);
    }

    public function test_the_glossary_is_read_with_print_labels_and_written_with_manage(): void
    {
        $count = LabelGlossaryEntry::query()->count();
        $this->assertGreaterThan(50, $count, 'seeded with the everyday ingredients');
        $this->getJson('/api/labels/glossary')->assertOk()->assertJsonCount($count, 'data');

        // The same word again changes its Dhivehi rather than adding a second row.
        $this->postJson('/api/labels/glossary', ['en' => 'FLOUR ', 'dv' => 'ފުށް (ގޮދަން)'])->assertOk()->assertJsonPath('data.dv', 'ފުށް (ގޮދަން)');
        $this->assertSame($count, LabelGlossaryEntry::query()->count());
        $this->postJson('/api/labels/glossary', ['en' => 'Flour', 'dv' => ''])->assertUnprocessable();

        $entry = LabelGlossaryEntry::query()->where('word', 'salt')->firstOrFail();
        $this->putJson("/api/labels/glossary/{$entry->id}", ['en' => 'Sea salt'])->assertOk()->assertJsonPath('data.word', 'sea salt');
        $this->putJson("/api/labels/glossary/{$entry->id}", ['en' => 'Flour'])->assertUnprocessable();
        $this->deleteJson("/api/labels/glossary/{$entry->id}")->assertOk();
        $this->assertNull(LabelGlossaryEntry::lookup('sea salt'));

        Sanctum::actingAs($this->makeStaff(), ['staff']);
        $this->getJson('/api/labels/glossary')->assertForbidden();
        $this->postJson('/api/labels/glossary', ['en' => 'Pepper', 'dv' => 'x'])->assertForbidden();
    }
}
