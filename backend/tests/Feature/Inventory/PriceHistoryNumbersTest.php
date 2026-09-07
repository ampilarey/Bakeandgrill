<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-07, on a phone: "Something went wrong — t.unit_cost.toFixed
 * is not a function."
 *
 * MySQL returns DECIMAL columns as strings and Eloquent's `decimal:` cast
 * keeps them that way, so this endpoint was handing the admin "1.976190"
 * where its type promised a number. The admin called toFixed on it and the
 * whole page went down — but only once an item had some buying history, so
 * it sat unnoticed until the first purchases were entered.
 */
class PriceHistoryNumbersTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_price_and_quantity_come_back_as_numbers(): void
    {
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $eggs = InventoryItem::create([
            'name' => 'Egg', 'unit' => 'piece', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
        $case = $eggs->purchaseUnits()->create(['name' => 'Case', 'base_units' => 210]);

        $this->postJson('/api/purchases', [
            'supplier_name_text' => 'Fahi Store',
            'purchase_date' => now()->toDateString(),
            'status' => 'received',
            'items' => [[
                'inventory_item_id' => $eggs->id, 'quantity' => 1, 'unit_cost' => 415,
                'purchase_unit_id' => $case->id,
            ]],
        ])->assertCreated();

        $row = $this->getJson("/api/inventory/{$eggs->id}/price-history")
            ->assertOk()
            ->json('history.0');

        // Not "1.976190": a JSON number, which is what the admin is told to
        // expect and what it does arithmetic on.
        // "Not a string" is the contract that matters — a whole number
        // decodes back to a PHP int, and the admin is happy with either.
        $this->assertIsNotString($row['unit_cost']);
        $this->assertIsNotString($row['quantity']);
        $this->assertIsNumeric($row['unit_cost']);
        $this->assertIsNumeric($row['quantity']);
        $this->assertEqualsWithDelta(1.976190, $row['unit_cost'], 0.000001);
        $this->assertEqualsWithDelta(210, $row['quantity'], 0.0001);
    }
}
