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
 * Owner, 2026-09-14: "when shop is selected, its most frequent item appears
 * for easier selection."
 *
 * The list is built from that shop's past orders: most often first, and each
 * carrying what was bought last time so one tap can fill a line.
 */
class SupplierFrequentItemsTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $bun;

    private InventoryItem $egg;

    private InventoryItem $flour;

    private InventoryPurchaseUnit $packet;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $make = fn (string $name, string $unit) => InventoryItem::create([
            'name' => $name, 'unit' => $unit, 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
        $this->bun = $make('Hotdog bun', 'piece');
        $this->egg = $make('Egg', 'piece');
        $this->flour = $make('Flour', 'kg');
        $this->packet = InventoryPurchaseUnit::create([
            'inventory_item_id' => $this->bun->id, 'name' => 'Packet', 'base_units' => 6,
        ]);
    }

    private function buy(string $shop, array $lines, string $date = '2026-09-07'): void
    {
        $this->postJson('/api/purchases', [
            'supplier_name_text' => $shop,
            'purchase_date' => $date,
            'items' => $lines,
        ])->assertCreated();
    }

    private function frequent(string $shop): array
    {
        return $this->getJson('/api/purchases/frequent-items?supplier_name=' . urlencode($shop))
            ->assertOk()->json();
    }

    public function test_a_shop_never_bought_from_has_nothing_to_offer(): void
    {
        $res = $this->frequent('Nowhere');

        $this->assertNull($res['supplier']);
        $this->assertSame([], $res['items']);
    }

    public function test_the_items_bought_most_often_come_first(): void
    {
        // Buns on three orders, eggs on two, flour once.
        $this->buy('Royal Bakery', [['inventory_item_id' => $this->bun->id, 'quantity' => 1, 'unit_cost' => 5], ['inventory_item_id' => $this->egg->id, 'quantity' => 30, 'unit_cost' => 2]], '2026-09-01');
        $this->buy('Royal Bakery', [['inventory_item_id' => $this->bun->id, 'quantity' => 1, 'unit_cost' => 5], ['inventory_item_id' => $this->flour->id, 'quantity' => 5, 'unit_cost' => 12]], '2026-09-02');
        $this->buy('Royal Bakery', [['inventory_item_id' => $this->bun->id, 'quantity' => 1, 'unit_cost' => 5], ['inventory_item_id' => $this->egg->id, 'quantity' => 30, 'unit_cost' => 2]], '2026-09-03');

        $res = $this->frequent('royal bakery');

        $this->assertSame('Royal Bakery', $res['supplier']['name']);
        $this->assertSame(['Hotdog bun', 'Egg', 'Flour'], array_column(array_column($res['items'], 'item'), 'name'));
        $this->assertSame([3, 2, 1], array_column($res['items'], 'orders'));
    }

    public function test_each_item_carries_what_was_bought_from_that_shop_last_time(): void
    {
        $this->buy('Royal Bakery', [[
            'inventory_item_id' => $this->bun->id, 'quantity' => 2, 'unit_cost' => 30,
            'purchase_unit_id' => $this->packet->id, 'brand' => 'Royal',
        ]], '2026-09-07');

        $bun = $this->frequent('Royal Bakery')['items'][0];

        $this->assertSame('Royal', $bun['last_brand']);
        $this->assertSame('Packet', $bun['last_pack_name']);
        // Whole numbers come back from JSON as ints; the figure is what matters.
        $this->assertEquals(2, $bun['last_quantity']);
        $this->assertEquals(30, $bun['last_pack_cost']);
        $this->assertSame('2026-09-07', $bun['last_purchase_date']);
    }

    public function test_another_shops_orders_do_not_leak_in(): void
    {
        $this->buy('Royal Bakery', [['inventory_item_id' => $this->bun->id, 'quantity' => 1, 'unit_cost' => 5]]);
        $this->buy('Fahi Store', [['inventory_item_id' => $this->flour->id, 'quantity' => 1, 'unit_cost' => 12]]);

        $names = array_column(array_column($this->frequent('Fahi Store')['items'], 'item'), 'name');

        $this->assertSame(['Flour'], $names);
    }

    public function test_an_item_archived_since_is_not_offered(): void
    {
        $this->buy('Royal Bakery', [['inventory_item_id' => $this->bun->id, 'quantity' => 1, 'unit_cost' => 5]]);
        $this->bun->update(['is_active' => false]);

        $this->assertSame([], $this->frequent('Royal Bakery')['items']);
    }
}
