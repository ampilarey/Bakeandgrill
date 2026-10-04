<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Permissions\PermissionCatalog;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\RecipeItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Label Hub, step 1 (owner, 2026-10-04; docs/LABEL_HUB_PLAN.md).
 */
class LabelItemSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    /** "By default admin only, but option to give permission to any staff." */
    public function test_label_permissions_are_owner_only_until_granted(): void
    {
        $this->assertContains('labels.print', PermissionCatalog::ownerOnlySlugs());
        $this->assertContains('labels.manage', PermissionCatalog::ownerOnlySlugs());
        $this->assertNotContains('labels.print', PermissionCatalog::managerSlugs());
        $this->assertContains('labels.manage', PermissionCatalog::expandCheckSlugs('labels.print'));

        $item = $this->makeItem();
        $manager = $this->makeManager();
        Sanctum::actingAs($manager, ['staff']);
        $this->getJson('/api/labels/products')->assertForbidden();
        $this->putJson("/api/items/{$item->id}/label", ['label_enabled' => true])->assertForbidden();

        $manager->grantPermission('labels.print');
        Sanctum::actingAs($manager->fresh(), ['staff']);
        $this->getJson('/api/labels/products')->assertOk();
        $this->putJson("/api/items/{$item->id}/label", ['label_enabled' => true])->assertForbidden();

        $cook = $this->makeKitchenStaff();
        $cook->grantPermission('labels.manage');
        Sanctum::actingAs($cook->fresh(), ['staff']);
        // Manage covers print.
        $this->getJson('/api/labels/products')->assertOk();
        $this->putJson("/api/items/{$item->id}/label", ['label_enabled' => true])->assertOk();
    }

    public function test_the_owner_sets_shelf_life_storage_and_ingredients_and_bad_values_are_refused(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = $this->makeItem(false, 0, ['name' => 'Bajiya']);

        $this->putJson("/api/items/{$item->id}/label", [
            'label_enabled' => true,
            'label_shelf_life_days' => 90,
            'label_storage' => 'frozen',
            'label_pack_qty' => 10,
            'label_ingredients_source' => 'manual',
            'label_ingredients' => 'Flour, salt, oil, onion, smoked tuna',
        ])->assertOk()
            ->assertJsonPath('data.label_shelf_life_days', 90)
            ->assertJsonPath('data.ingredients.en', 'Flour, salt, oil, onion, smoked tuna')
            ->assertJsonPath('data.ingredients.from', 'manual');

        $this->putJson("/api/items/{$item->id}/label", ['label_shelf_life_days' => 0])->assertUnprocessable();
        $this->putJson("/api/items/{$item->id}/label", ['label_storage' => 'warm'])->assertUnprocessable();
        $this->putJson("/api/items/{$item->id}/label", ['label_ingredients_source' => 'guess'])->assertUnprocessable();

        // Only label-enabled items list by default; ?all=1 lists the menu.
        $this->makeItem(false, 0, ['name' => 'Coffee']);
        $this->getJson('/api/labels/products')->assertJsonCount(1, 'data');
        $this->getJson('/api/labels/products?all=1')->assertJsonCount(2, 'data');
    }

    /** "Add option to include manual ingredients if recipe is not there in the item." */
    public function test_ingredients_come_from_the_recipe_heaviest_first_and_fall_back_to_the_manual_line(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = $this->makeItem(false, 0, ['name' => 'Bajiya', 'label_ingredients' => 'Written by hand']);

        // No recipe: auto uses the manual line.
        $this->getJson("/api/labels/items/{$item->id}")
            ->assertJsonPath('data.ingredients.from', 'manual')
            ->assertJsonPath('data.ingredients.en', 'Written by hand');

        $flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'current_stock' => 10, 'unit_cost' => 1, 'is_active' => true, 'name_dv' => 'ފުށް']);
        $tuna = InventoryItem::create(['name' => 'Smoked Tuna', 'unit' => 'g', 'current_stock' => 10, 'unit_cost' => 1, 'is_active' => true, 'name_dv' => 'ވަޅޯމަސް']);
        $salt = InventoryItem::create(['name' => 'Salt', 'unit' => 'g', 'current_stock' => 10, 'unit_cost' => 1, 'is_active' => true, 'name_dv' => 'ލޮނު']);
        $film = InventoryItem::create(['name' => 'Cling film', 'unit' => 'pcs', 'current_stock' => 10, 'unit_cost' => 1, 'is_active' => true, 'is_label_ingredient' => false]);
        $recipe = Recipe::create(['item_id' => $item->id, 'yield_quantity' => 1, 'limits_availability' => false, 'total_cost' => 0]);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $salt->id, 'quantity' => 5, 'unit' => 'g']);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $tuna->id, 'quantity' => 200, 'unit' => 'g']);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $flour->id, 'quantity' => 0.5, 'unit' => 'kg']);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $film->id, 'quantity' => 1, 'unit' => 'pcs']);

        // 500 g flour, 200 g tuna, 5 g salt; the cling film is not food.
        $this->getJson("/api/labels/items/{$item->id}")
            ->assertJsonPath('data.ingredients.from', 'recipe')
            ->assertJsonPath('data.ingredients.en', 'Flour, smoked tuna, salt')
            ->assertJsonPath('data.ingredients.dv', 'ފުށް، ވަޅޯމަސް، ލޮނު')
            ->assertJsonPath('data.has_recipe', true);

        // Manual ignores the recipe.
        $item->update(['label_ingredients_source' => 'manual']);
        $this->getJson("/api/labels/items/{$item->id}")
            ->assertJsonPath('data.ingredients.from', 'manual')
            ->assertJsonPath('data.ingredients.en', 'Written by hand');

        // A recipe whose rows are all unticked falls back to the manual line.
        $item->update(['label_ingredients_source' => 'recipe']);
        InventoryItem::query()->update(['is_label_ingredient' => false]);
        $this->getJson("/api/labels/items/{$item->id}")
            ->assertJsonPath('data.ingredients.from', 'manual');
    }
}
