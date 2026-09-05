<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\PurchaseItem;
use App\Models\SupplierPriceHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Which brand a purchase was.
 *
 * Owner, 2026-09-05: "egg has many brand i mean company logo. And different
 * days different brands has different prices. So need to record i bought today
 * egg brand a. Yesterday b".
 *
 * The brand is a fact about the buying, not about the item. An egg is an egg
 * on the shelf, so the stock stays one number and recipes keep pointing at one
 * thing; what changes brand to brand is the price. These tests hold that line:
 * the brand reaches the price history where it can be compared, and it never
 * splits the count.
 */
class PurchaseBrandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function eggs(): InventoryItem
    {
        return InventoryItem::create([
            'name' => 'Egg',
            'sku' => 'EGG-1',
            'unit' => 'piece',
            'current_stock' => 0,
            'unit_cost' => 0,
            'is_active' => true,
        ]);
    }

    private function buy(InventoryItem $item, float $qty, float $cost, ?string $brand, string $date): void
    {
        $this->postJson('/api/purchases', [
            'supplier_name_text' => 'Fahi Store',
            'purchase_date' => $date,
            'status' => 'received',
            'items' => [array_filter([
                'inventory_item_id' => $item->id,
                'quantity' => $qty,
                'unit_cost' => $cost,
                'brand' => $brand,
            ], fn ($v) => $v !== null)],
        ])->assertCreated();
    }

    public function test_a_purchase_records_the_brand_it_was(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();

        $this->buy($eggs, 30, 2.10, 'Brand A', now()->toDateString());

        $this->assertSame('Brand A', PurchaseItem::firstOrFail()->brand);
    }

    public function test_two_brands_are_one_count_on_the_shelf(): void
    {
        // The whole reason brand is not on the item. 30 of one and 30 of the
        // other is 60 eggs, and "do I have eggs" must not need adding up rows.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();

        $this->buy($eggs, 30, 2.10, 'Brand A', now()->subDay()->toDateString());
        $this->buy($eggs, 30, 1.95, 'Brand B', now()->toDateString());

        $eggs->refresh();
        $this->assertEqualsWithDelta(60, (float) $eggs->current_stock, 0.001);
        $this->assertSame(1, InventoryItem::count(), 'Brands must not split the item.');
    }

    public function test_each_brand_keeps_its_own_price_in_the_history(): void
    {
        // The question worth asking: what does each brand cost. Averaging them
        // into one number would answer it wrongly and silently.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();

        $this->buy($eggs, 30, 2.10, 'Brand A', now()->subDay()->toDateString());
        $this->buy($eggs, 30, 1.95, 'Brand B', now()->toDateString());

        $prices = SupplierPriceHistory::where('inventory_item_id', $eggs->id)
            ->orderBy('id')
            ->get()
            ->pluck('unit_price', 'brand')
            ->map(fn ($p) => (float) $p)
            ->all();

        $this->assertEqualsWithDelta(2.10, $prices['Brand A'], 0.0001);
        $this->assertEqualsWithDelta(1.95, $prices['Brand B'], 0.0001);
    }

    public function test_the_same_brand_on_two_days_keeps_both_prices(): void
    {
        // "different days different brands has different prices" — so the same
        // brand moving in price is two records, not one overwritten.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();

        $this->buy($eggs, 30, 2.10, 'Brand A', now()->subDay()->toDateString());
        $this->buy($eggs, 30, 2.40, 'Brand A', now()->toDateString());

        $rows = SupplierPriceHistory::where('brand', 'Brand A')->orderBy('id')->get();
        $this->assertCount(2, $rows);
        $this->assertEqualsWithDelta(2.10, (float) $rows[0]->unit_price, 0.0001);
        $this->assertEqualsWithDelta(2.40, (float) $rows[1]->unit_price, 0.0001);
    }

    public function test_the_buying_screen_is_offered_the_brands_bought_before(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();

        $this->buy($eggs, 30, 2.10, 'Brand A', now()->subDays(2)->toDateString());
        $this->buy($eggs, 30, 1.95, 'Brand B', now()->subDay()->toDateString());
        // Buying A again should not list it twice.
        $this->buy($eggs, 30, 2.20, 'Brand A', now()->toDateString());

        $brands = $this->getJson("/api/inventory/{$eggs->id}/purchase-units")
            ->assertOk()
            ->json('brands');

        // Most recent first: what you bought last is the likeliest next.
        $this->assertSame(['Brand A', 'Brand B'], $brands);
    }

    public function test_brands_do_not_leak_between_items(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();
        $flour = InventoryItem::create([
            'name' => 'Flour', 'sku' => 'FLR-1', 'unit' => 'kg',
            'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);

        $this->buy($eggs, 30, 2.10, 'Brand A', now()->toDateString());

        $this->assertSame(
            [],
            $this->getJson("/api/inventory/{$flour->id}/purchase-units")->assertOk()->json('brands'),
        );
    }

    public function test_a_purchase_with_no_brand_is_still_fine(): void
    {
        // Plenty of things have no brand worth recording, and nothing should
        // insist on one.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();

        $this->buy($eggs, 30, 2.10, null, now()->toDateString());

        $this->assertNull(PurchaseItem::firstOrFail()->brand);
        $this->assertNull(SupplierPriceHistory::firstOrFail()->brand);
    }

    public function test_a_blank_brand_is_stored_as_nothing_rather_than_an_empty_string(): void
    {
        // Otherwise "" becomes a brand in its own right and shows up in the
        // suggestions as a blank line nobody can explain.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();

        $this->postJson('/api/purchases', [
            'supplier_name_text' => 'Fahi Store',
            'purchase_date' => now()->toDateString(),
            'status' => 'received',
            'items' => [[
                'inventory_item_id' => $eggs->id,
                'quantity' => 30,
                'unit_cost' => 2,
                'brand' => '   ',
            ]],
        ])->assertCreated();

        $this->assertNull(PurchaseItem::firstOrFail()->brand);
        $this->assertSame([], $this->getJson("/api/inventory/{$eggs->id}/purchase-units")->json('brands'));
    }
}
