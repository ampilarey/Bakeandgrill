<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Buying from the shop on the corner.
 *
 * Owner, 2026-09-05: entering a purchase means recording "shop name, items,
 * price, quantity". Most buying is not a standing account — it is somebody
 * walking to the corner shop for two crates and a bag of ice. Typing the name
 * is still the whole interaction, and nobody fills in a supplier form.
 *
 * What changed later the same day, at the owner's word ("no need both, keep one
 * only"): the typed name now *becomes* a supplier rather than sitting beside
 * one. The two earlier tests here asserted the opposite — that a typed name
 * left `supplier_id` null, and that a chosen supplier left the text null — so
 * they assert the new rule instead. That was the whole defect: everything which
 * compares prices joins the supplier table, so a name with no record behind it
 * was invisible to all of it and its price was never recorded at all.
 */
class PurchaseShopNameTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function item(): InventoryItem
    {
        return InventoryItem::create([
            'name' => 'Ice', 'unit' => 'bag', 'current_stock' => 0, 'is_active' => true,
        ]);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'purchase_date' => now()->toDateString(),
            'items' => [[
                'inventory_item_id' => $this->item()->id,
                'quantity' => 2,
                'unit_cost' => 25,
            ]],
        ], $overrides);
    }

    public function test_naming_a_shop_creates_the_supplier_behind_it(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/purchases', $this->payload([
            'supplier_name_text' => 'Fahi Store',
        ]))->assertCreated();

        $purchase = Purchase::query()->firstOrFail();
        $this->assertSame('Fahi Store', $purchase->supplier_name_text);

        // The name is now a record, so this purchase can be compared on price
        // with every other. Typing it was still all anybody did.
        $supplier = Supplier::where('name', 'Fahi Store')->firstOrFail();
        $this->assertSame($supplier->id, (int) $purchase->supplier_id);
    }

    public function test_a_registered_supplier_still_works_and_keeps_its_name(): void
    {
        // Picking a supplier off the list is just a faster way of typing its
        // name, so the row ends up in the same shape either way.
        $supplier = Supplier::create(['name' => 'Island Wholesale', 'is_active' => true]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/purchases', $this->payload([
            'supplier_id' => $supplier->id,
        ]))->assertCreated();

        $purchase = Purchase::query()->firstOrFail();
        $this->assertSame($supplier->id, (int) $purchase->supplier_id);
        $this->assertSame('Island Wholesale', $purchase->supplier_name_text);
        // No second row for a supplier that already existed.
        $this->assertSame(1, Supplier::count());
    }

    public function test_a_purchase_with_neither_is_still_allowed(): void
    {
        /*
         * It always was — `supplier_id` has been nullable since the table was
         * created, for POS walk-in receives. Naming the shop must not quietly
         * make the seller mandatory.
         */
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/purchases', $this->payload())->assertCreated();

        $this->assertSame(1, Purchase::query()->count());
    }

    public function test_an_overlong_shop_name_is_refused_rather_than_truncated(): void
    {
        // Silently cutting it would leave a purchase attributed to half a name.
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/purchases', $this->payload([
            'supplier_name_text' => str_repeat('a', 256),
        ]))->assertStatus(422)->assertJsonValidationErrors(['supplier_name_text']);
    }
}
