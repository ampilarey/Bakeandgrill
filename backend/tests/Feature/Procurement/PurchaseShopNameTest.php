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
 * Buying from a shop that is not a supplier on file.
 *
 * Owner, 2026-09-05: entering a purchase means recording "shop name, items,
 * price, quantity". Most buying is not a standing account — it is somebody
 * walking to the corner shop for two crates and a bag of ice. Forcing a
 * supplier record for each of those leaves you with a register full of
 * one-purchase suppliers, or a purchase nobody bothers to enter.
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

    public function test_a_purchase_can_name_the_shop_instead_of_a_supplier_record(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/purchases', $this->payload([
            'supplier_name_text' => 'Fahi Store',
        ]))->assertCreated();

        $purchase = Purchase::query()->firstOrFail();
        $this->assertSame('Fahi Store', $purchase->supplier_name_text);
        $this->assertNull($purchase->supplier_id);
    }

    public function test_a_registered_supplier_still_works_and_is_unaffected(): void
    {
        // The typed shop is an alternative, not a replacement.
        $supplier = Supplier::create(['name' => 'Island Wholesale', 'is_active' => true]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/purchases', $this->payload([
            'supplier_id' => $supplier->id,
        ]))->assertCreated();

        $purchase = Purchase::query()->firstOrFail();
        $this->assertSame($supplier->id, (int) $purchase->supplier_id);
        $this->assertNull($purchase->supplier_name_text);
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
