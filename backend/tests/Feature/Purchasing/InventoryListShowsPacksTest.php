<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\InventoryPurchaseUnit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The inventory list says how each item is bought.
 *
 * Owner, 2026-09-06: "i dont see pack size", asking how to handle ghee that
 * comes in 100 ml and 500 ml tins. Packs existed but were invisible — you had
 * to open a modal per item to find out whether one had any, so a shop with
 * them set up looked exactly like a shop without. The row cannot say
 * "buys as a 500 ml tin" unless the list payload carries them.
 */
class InventoryListShowsPacksTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function ghee(): InventoryItem
    {
        return InventoryItem::create([
            'name' => 'Ghee',
            'sku' => 'GHEE-1',
            'unit' => 'ml',
            'current_stock' => 2500,
            'unit_cost' => 0.19,
            'is_active' => true,
        ]);
    }

    public function test_the_list_carries_each_items_packs(): void
    {
        $ghee = $this->ghee();
        InventoryPurchaseUnit::create(['inventory_item_id' => $ghee->id, 'name' => '100 ml tin', 'base_units' => 100]);
        InventoryPurchaseUnit::create(['inventory_item_id' => $ghee->id, 'name' => '500 ml tin', 'base_units' => 500]);

        $row = collect($this->getJson('/api/inventory')->assertOk()->json('items.data'))
            ->firstWhere('id', $ghee->id);

        $packs = collect($row['purchase_units']);

        $this->assertCount(2, $packs);
        $this->assertEqualsWithDelta(100.0, (float) $packs->firstWhere('name', '100 ml tin')['base_units'], 0.001);
        $this->assertEqualsWithDelta(500.0, (float) $packs->firstWhere('name', '500 ml tin')['base_units'], 0.001);
    }

    public function test_an_item_bought_loose_carries_an_empty_list(): void
    {
        // Not a missing key: the row reads it without checking, and an absent
        // one would read as "unknown" rather than "none".
        $salt = InventoryItem::create([
            'name' => 'Salt',
            'sku' => 'SALT-1',
            'unit' => 'kg',
            'current_stock' => 8,
            'unit_cost' => 12,
            'is_active' => true,
        ]);

        $row = collect($this->getJson('/api/inventory')->assertOk()->json('items.data'))
            ->firstWhere('id', $salt->id);

        $this->assertSame([], $row['purchase_units']);
    }

    public function test_packs_belong_to_their_own_item(): void
    {
        // A 500 ml tin of ghee must not appear against the flour.
        $ghee = $this->ghee();
        InventoryPurchaseUnit::create(['inventory_item_id' => $ghee->id, 'name' => '500 ml tin', 'base_units' => 500]);

        $flour = InventoryItem::create([
            'name' => 'Flour',
            'sku' => 'FLOUR-1',
            'unit' => 'kg',
            'current_stock' => 50,
            'unit_cost' => 9,
            'is_active' => true,
        ]);
        InventoryPurchaseUnit::create(['inventory_item_id' => $flour->id, 'name' => 'Sack', 'base_units' => 25]);

        $rows = collect($this->getJson('/api/inventory')->assertOk()->json('items.data'));

        $this->assertSame(
            ['500 ml tin'],
            collect($rows->firstWhere('id', $ghee->id)['purchase_units'])->pluck('name')->all(),
        );
        $this->assertSame(
            ['Sack'],
            collect($rows->firstWhere('id', $flour->id)['purchase_units'])->pluck('name')->all(),
        );
    }
}
