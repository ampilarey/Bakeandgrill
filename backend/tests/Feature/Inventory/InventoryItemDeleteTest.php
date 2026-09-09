<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryBrandPhoto;
use App\Models\InventoryItem;
use App\Models\InventoryPurchaseUnit;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-09: "how to del an item in inventory."
 *
 * There was no way at all, which is wrong for the case this exists to serve:
 * a name typed badly five minutes ago with nothing behind it.
 *
 * It stays wrong for an item that has been bought, counted or cooked with.
 * Those rows are the purchase history and the cost of goods; deleting the
 * item destroys or orphans them. That item gets archived, which is the honest
 * version of "stop showing me this" — every figure already reported stays.
 */
class InventoryItemDeleteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function item(array $attrs = []): InventoryItem
    {
        return InventoryItem::create(array_merge([
            'name' => 'Turmeric Powder', 'unit' => 'g', 'current_stock' => 0,
            'unit_cost' => 0, 'is_active' => true,
        ], $attrs));
    }

    public function test_an_item_nothing_has_touched_can_be_deleted(): void
    {
        $item = $this->item();

        $this->deleteJson("/api/inventory/{$item->id}")->assertOk()->assertJson(['deleted' => true]);

        $this->assertSame(0, InventoryItem::where('id', $item->id)->count());
    }

    public function test_its_packs_and_brand_pictures_go_with_it(): void
    {
        $item = $this->item();
        InventoryPurchaseUnit::create([
            'inventory_item_id' => $item->id, 'name' => '500g pack', 'base_units' => 500,
        ]);
        InventoryBrandPhoto::create([
            'inventory_item_id' => $item->id, 'brand' => 'GRB', 'brand_key' => 'grb',
        ]);

        $this->deleteJson("/api/inventory/{$item->id}")->assertOk();

        $this->assertSame(0, InventoryPurchaseUnit::where('inventory_item_id', $item->id)->count());
        $this->assertSame(0, InventoryBrandPhoto::where('inventory_item_id', $item->id)->count());
    }

    public function test_an_item_with_stock_movements_is_refused_and_told_why(): void
    {
        $item = $this->item();
        StockMovement::create([
            'inventory_item_id' => $item->id, 'type' => 'purchase', 'quantity' => 500,
            'balance_after' => 500, 'notes' => 'first buy',
        ]);

        $res = $this->deleteJson("/api/inventory/{$item->id}")
            ->assertStatus(409)
            ->assertJson(['conflict' => 'inventory_item_in_use']);

        $this->assertStringContainsString('1 stock movements', $res->json('message'));
        $this->assertStringContainsString('Archive it instead', $res->json('message'));
        $this->assertSame(1, InventoryItem::where('id', $item->id)->count());
    }

    public function test_an_item_with_stock_on_the_shelf_is_refused(): void
    {
        // Deleting this loses a real number off the valuation, quietly.
        $item = $this->item(['current_stock' => 250]);

        $res = $this->deleteJson("/api/inventory/{$item->id}")->assertStatus(409);

        $this->assertStringContainsString('250 g still on the shelf', $res->json('message'));
        $this->assertSame(1, InventoryItem::where('id', $item->id)->count());
    }

    public function test_the_refusal_names_every_thing_holding_it(): void
    {
        $item = $this->item(['current_stock' => 10]);
        StockMovement::create([
            'inventory_item_id' => $item->id, 'type' => 'purchase', 'quantity' => 10,
            'balance_after' => 10,
        ]);

        $res = $this->deleteJson("/api/inventory/{$item->id}")->assertStatus(409);

        $this->assertStringContainsString('still on the shelf', $res->json('message'));
        $this->assertStringContainsString('stock movements', $res->json('message'));
        $this->assertSame(1, $res->json('used_by.stock_movements'));
    }

    public function test_archiving_is_the_way_out_and_keeps_the_item(): void
    {
        $item = $this->item(['current_stock' => 250]);

        $this->patchJson("/api/inventory/{$item->id}", ['is_active' => false])->assertOk();

        $this->assertFalse((bool) $item->fresh()->is_active);
        // Off the buying screens, still in the data.
        $listed = $this->getJson('/api/inventory?active_only=1')->assertOk()->json('items.data');
        $this->assertNotContains($item->id, array_column($listed, 'id'));
        $this->assertSame(1, InventoryItem::where('id', $item->id)->count());
    }

    public function test_a_cook_cannot_delete_an_item(): void
    {
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $cashier = User::create([
            'name' => 'Cashier', 'email' => 'till-del@test.com', 'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $cashier->grantPermission('inventory.view');
        $item = $this->item();
        Sanctum::actingAs($cashier, ['staff']);

        $this->deleteJson("/api/inventory/{$item->id}")->assertForbidden();

        $this->assertSame(1, InventoryItem::where('id', $item->id)->count());
    }

    public function test_deleting_something_that_is_not_there_is_a_not_found(): void
    {
        $this->deleteJson('/api/inventory/999999')->assertNotFound();
    }

    /*
     * Owner, 2026-09-09: "why 2 items in same name" — two Ghee rows, one with
     * pack sizes and one without. Nothing stopped it: SKU and barcode are
     * unique, the name never was. A duplicate splits the stock count, splits
     * the recipe link, and leaves the price comparison nothing to compare.
     */

    public function test_a_second_item_under_a_name_already_used_is_questioned(): void
    {
        $first = $this->item(['name' => 'Ghee', 'unit' => 'ml', 'current_stock' => 500]);

        $res = $this->postJson('/api/inventory', ['name' => 'Ghee', 'unit' => 'ml'])
            ->assertStatus(409)
            ->assertJson(['conflict' => 'inventory_item_name_in_use']);

        $this->assertSame($first->id, $res->json('existing.id'));
        $this->assertStringContainsString('500 ml on hand', $res->json('message'));
        $this->assertSame(1, InventoryItem::where('name', 'Ghee')->count());
    }

    public function test_the_question_ignores_case_and_stray_spaces(): void
    {
        $this->item(['name' => 'Ghee']);

        $this->postJson('/api/inventory', ['name' => '  ghee  ', 'unit' => 'ml'])->assertStatus(409);
    }

    public function test_an_archived_item_still_counts_as_the_name_being_used(): void
    {
        // Otherwise archiving one and adding another is the same mess again,
        // with the old stock hidden rather than gone.
        $this->item(['name' => 'Ghee', 'unit' => 'ml', 'is_active' => false]);

        $res = $this->postJson('/api/inventory', ['name' => 'Ghee', 'unit' => 'ml'])->assertStatus(409);

        $this->assertStringContainsString('archived', $res->json('message'));
    }

    public function test_a_duplicate_is_allowed_when_it_was_meant(): void
    {
        // Only the person typing knows whether this is a second thing that
        // happens to share a name, so the answer is theirs to give.
        $this->item(['name' => 'Ghee', 'unit' => 'ml']);

        $this->postJson('/api/inventory', [
            'name' => 'Ghee', 'unit' => 'ml', 'allow_duplicate_name' => true,
        ])->assertCreated();

        $this->assertSame(2, InventoryItem::where('name', 'Ghee')->count());
    }

    public function test_a_new_name_is_not_questioned(): void
    {
        $this->item(['name' => 'Ghee']);

        $this->postJson('/api/inventory', ['name' => 'Butter', 'unit' => 'g'])->assertCreated();
    }
}
