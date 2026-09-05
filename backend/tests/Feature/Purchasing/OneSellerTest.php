<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Services\SupplierResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A shop and a supplier are one thing.
 *
 * Buying used to record the seller two ways: a supplier you picked, or a name
 * you typed. Everything that compares prices joins the supplier table, so a
 * typed name was invisible to all of it — and the price paid was never written
 * to price history at all. The point of these tests is that typing a name is
 * still the whole interaction, and that it now produces a supplier, so the
 * price lands where the comparisons can see it.
 */
class OneSellerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function resolver(): SupplierResolver
    {
        return app(SupplierResolver::class);
    }

    private function makeStockItem(string $name = 'Flour'): InventoryItem
    {
        return InventoryItem::create([
            'name' => $name,
            'sku' => strtoupper($name) . '-1',
            'unit' => 'kg',
            'current_stock' => 0,
            'unit_cost' => 0,
            'is_active' => true,
        ]);
    }

    public function test_a_typed_name_becomes_a_supplier(): void
    {
        $supplier = $this->resolver()->forName('Fahi Store');

        $this->assertNotNull($supplier);
        $this->assertSame('Fahi Store', $supplier->name);
        $this->assertTrue($supplier->is_active);
        $this->assertDatabaseHas('suppliers', ['name' => 'Fahi Store']);
    }

    public function test_the_same_shop_typed_differently_is_one_supplier(): void
    {
        // Otherwise a week of buying at one shop splits into three price
        // histories and none of them can be compared with anything.
        $first = $this->resolver()->forName('Fahi Store');
        $second = $this->resolver()->forName('  fahi store  ');
        $third = $this->resolver()->forName('FAHI STORE');

        $this->assertSame($first->id, $second->id);
        $this->assertSame($first->id, $third->id);
        $this->assertSame(1, Supplier::where('name', 'Fahi Store')->count());
    }

    public function test_it_reuses_a_supplier_somebody_retired(): void
    {
        $original = Supplier::create(['name' => 'Agora', 'is_active' => true]);
        $original->delete();

        $resolved = $this->resolver()->forName('Agora');

        $this->assertSame($original->id, $resolved->id);
        $this->assertFalse($resolved->trashed());
    }

    public function test_an_empty_name_resolves_to_nobody(): void
    {
        $this->assertNull($this->resolver()->forName('   '));
        $this->assertNull($this->resolver()->resolve(null, null));
        $this->assertSame(0, Supplier::count());
    }

    public function test_a_chosen_supplier_wins_over_a_stale_typed_name(): void
    {
        $chosen = Supplier::create(['name' => 'Wholesale Co', 'is_active' => true]);

        $resolved = $this->resolver()->resolve($chosen->id, 'Something Else');

        $this->assertSame($chosen->id, $resolved->id);
        $this->assertDatabaseMissing('suppliers', ['name' => 'Something Else']);
    }

    public function test_buying_from_a_typed_shop_records_the_price_against_it(): void
    {
        // The whole point. Before this, a purchase with no supplier wrote no
        // price history, so the shop could never be compared on price.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = $this->makeStockItem();

        $this->postJson('/api/purchases', [
            'supplier_name_text' => 'Fahi Store',
            'purchase_date' => now()->toDateString(),
            'status' => 'received',
            'items' => [[
                'inventory_item_id' => $item->id,
                'name' => $item->name,
                'quantity' => 4,
                'unit_cost' => 25.5,
            ]],
        ])->assertCreated();

        $supplier = Supplier::where('name', 'Fahi Store')->firstOrFail();
        $purchase = Purchase::latest('id')->firstOrFail();

        $this->assertSame($supplier->id, $purchase->supplier_id);
        // The denormalised copy agrees with the record, so no read can show
        // one seller while another is stored.
        $this->assertSame('Fahi Store', $purchase->supplier_name_text);

        $price = SupplierPriceHistory::where('inventory_item_id', $item->id)->firstOrFail();
        $this->assertSame($supplier->id, $price->supplier_id);
        $this->assertEquals(25.5, (float) $price->unit_price);
    }

    public function test_the_cheapest_source_can_now_see_a_shop(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = $this->makeStockItem();

        foreach ([['Fahi Store', 30.0], ['Corner Mart', 18.0]] as [$name, $cost]) {
            $this->postJson('/api/purchases', [
                'supplier_name_text' => $name,
                'purchase_date' => now()->toDateString(),
                'status' => 'received',
                'items' => [[
                    'inventory_item_id' => $item->id,
                    'name' => $item->name,
                    'quantity' => 1,
                    'unit_cost' => $cost,
                ]],
            ])->assertCreated();
        }

        $cheapest = $this->getJson("/api/inventory/{$item->id}/cheapest-supplier")
            ->assertOk()
            ->json('supplier');

        $this->assertNotNull($cheapest, 'A typed shop should be comparable on price.');
        $this->assertSame('Corner Mart', $cheapest['name']);
        $this->assertEquals(18.0, $cheapest['min_cost']);
    }

    public function test_two_purchases_from_one_shop_share_its_supplier(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = $this->makeStockItem();

        foreach (['Fahi Store', 'fahi store'] as $typed) {
            $this->postJson('/api/purchases', [
                'supplier_name_text' => $typed,
                'purchase_date' => now()->toDateString(),
                'status' => 'received',
                'items' => [[
                    'inventory_item_id' => $item->id,
                    'name' => $item->name,
                    'quantity' => 1,
                    'unit_cost' => 10,
                ]],
            ])->assertCreated();
        }

        $this->assertSame(1, Supplier::count(), 'One shop, one supplier.');
        $this->assertSame(2, SupplierPriceHistory::count());
    }
}
