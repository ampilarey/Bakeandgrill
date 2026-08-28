<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Recipe;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Recording an item recipe, and the cost / margin / profit it produces.
 *
 * The permission story is the point: recipes.manage is owner-only, so a menu
 * manager can run the menu but never sees what a dish costs to make. The
 * arithmetic is a live roll-up of ingredient prices — a stored snapshot must
 * not out-live a price change (the stale-cost finding in AUDIT_MONEY_PASS3).
 */
class RecipeRecorderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function flour(float $unitCost): InventoryItem
    {
        return InventoryItem::create([
            'name' => 'Flour',
            'unit' => 'kg',
            'unit_cost' => $unitCost,
            'is_active' => true,
        ]);
    }

    public function test_owner_records_a_recipe_and_gets_cost_margin_and_profit(): void
    {
        // THE test. MVR 100 dish using 2 kg of flour at MVR 20/kg → MVR 40
        // cost, MVR 60 profit, 60% margin.
        $item = Item::factory()->create(['base_price' => 100, 'cost' => 0]);
        $flour = $this->flour(20);

        $res = $this->putJson("/api/items/{$item->id}/recipe", [
            'ingredients' => [
                ['inventory_item_id' => $flour->id, 'quantity' => 2, 'unit' => 'kg'],
            ],
        ], $this->staffHeaders($this->makeOwner()))->assertOk();

        $this->assertSame(40.0, (float) $res->json('item.recipe_cost'));
        $this->assertSame(60.0, (float) $res->json('item.profit'));
        $this->assertSame(60.0, (float) $res->json('item.margin_pct'));
        $this->assertSame(40.0, (float) Recipe::where('item_id', $item->id)->value('total_cost'));
    }

    public function test_cost_tracks_a_later_ingredient_price_change(): void
    {
        // The stale-cost fix. The recipe was saved at MVR 20/kg; flour then
        // rises to MVR 30/kg. The cost must follow, not stay frozen at the
        // snapshot.
        $item = Item::factory()->create(['base_price' => 100]);
        $flour = $this->flour(20);
        $owner = $this->makeOwner();

        $this->putJson("/api/items/{$item->id}/recipe", [
            'ingredients' => [['inventory_item_id' => $flour->id, 'quantity' => 2]],
        ], $this->staffHeaders($owner))->assertOk();

        $flour->update(['unit_cost' => 30]);

        $this->getJson("/api/items/{$item->id}/recipe", $this->staffHeaders($owner))
            ->assertOk()
            ->assertOk();
        $this->assertSame(60.0, (float) $this->getJson("/api/items/{$item->id}/recipe", $this->staffHeaders($owner))->json('item.recipe_cost'));
    }

    public function test_saving_replaces_the_ingredient_list(): void
    {
        $item = Item::factory()->create(['base_price' => 100]);
        $flour = $this->flour(20);
        $sugar = InventoryItem::create(['name' => 'Sugar', 'unit' => 'kg', 'unit_cost' => 10, 'is_active' => true]);
        $owner = $this->makeOwner();

        $this->putJson("/api/items/{$item->id}/recipe", [
            'ingredients' => [['inventory_item_id' => $flour->id, 'quantity' => 2]],
        ], $this->staffHeaders($owner))->assertOk();

        $res = $this->putJson("/api/items/{$item->id}/recipe", [
            'ingredients' => [['inventory_item_id' => $sugar->id, 'quantity' => 3]],
        ], $this->staffHeaders($owner))->assertOk();

        // Only sugar remains: 3 × 10 = 30.
        $this->assertSame(30.0, (float) $res->json('item.recipe_cost'));
        $this->assertCount(1, $res->json('item.recipe.ingredients'));
    }

    public function test_zero_quantity_lines_are_dropped(): void
    {
        $item = Item::factory()->create(['base_price' => 100]);
        $flour = $this->flour(20);

        $res = $this->putJson("/api/items/{$item->id}/recipe", [
            'ingredients' => [
                ['inventory_item_id' => $flour->id, 'quantity' => 2],
                ['inventory_item_id' => $flour->id, 'quantity' => 0],
            ],
        ], $this->staffHeaders($this->makeOwner()))->assertOk();

        $this->assertCount(1, $res->json('item.recipe.ingredients'));
    }

    public function test_a_manager_cannot_see_or_edit_recipes(): void
    {
        // recipes.manage is owner-only. A manager runs the menu but is walled
        // off from cost.
        $item = Item::factory()->create(['base_price' => 100]);
        $manager = $this->makeStaff('manager');

        $this->getJson("/api/items/{$item->id}/recipe", $this->staffHeaders($manager))->assertStatus(403);
        $this->putJson("/api/items/{$item->id}/recipe", ['ingredients' => []], $this->staffHeaders($manager))->assertStatus(403);
    }

    public function test_the_item_list_hides_cost_from_non_owners(): void
    {
        // The margin badge reads effective_cost / cost. A manager must get
        // null for those, an owner the real figure.
        // The Item model auto-creates an enabled dine_in channel row on create,
        // so the item is already visible on the dine-in channel.
        $item = Item::factory()->create(['base_price' => 100, 'cost' => 40]);

        // The public /items route resolves the acting user through the guard,
        // not a raw bearer, so use actingAs (as the other admin menu tests do).
        \Laravel\Sanctum\Sanctum::actingAs($this->makeStaff('manager'), ['staff']);
        $managerRows = $this->getJson('/api/items?admin=1')->json('data');

        \Laravel\Sanctum\Sanctum::actingAs($this->makeOwner(), ['staff']);
        $ownerRows = $this->getJson('/api/items?admin=1')->json('data');

        $managerRow = collect($managerRows)->firstWhere('id', $item->id);
        $ownerRow = collect($ownerRows)->firstWhere('id', $item->id);

        $this->assertNull($managerRow['cost'] ?? null, 'manager must not see cost');
        $this->assertSame(40.0, (float) $ownerRow['cost'], 'owner sees cost');
    }
}
