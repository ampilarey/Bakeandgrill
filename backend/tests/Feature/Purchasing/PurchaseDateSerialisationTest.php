<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-07: the purchase order list showed
 * "2026-08-31T19:00:00.000000Z" against an order dated the 1st of September.
 *
 * A plain `date` cast serialises midnight in the app's timezone, and the app
 * runs on Indian/Maldives (UTC+5), so every purchase date left here as 7pm
 * the evening before. The admin prints the string, so the owner was shown the
 * wrong day on every row — and slicing the first ten characters, the obvious
 * front-end patch, would have kept showing the wrong day.
 */
class PurchaseDateSerialisationTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_purchase_date_comes_back_as_the_day_that_was_typed(): void
    {
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $flour = InventoryItem::create([
            'name' => 'Flour', 'unit' => 'kg', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);

        $res = $this->postJson('/api/purchases', [
            'supplier_name_text' => 'Bazaaru',
            // Back-dated, which is the whole point: it is not today.
            'purchase_date' => '2026-09-01',
            'status' => 'draft',
            'items' => [['inventory_item_id' => $flour->id, 'quantity' => 5, 'unit_cost' => 20]],
        ])->assertCreated()->json('purchase');

        $this->assertSame('2026-09-01', $res['purchase_date']);

        // The delivery date is set on the record rather than at creation —
        // the endpoint does not take one — and carries the same cast.
        \App\Models\Purchase::whereKey($res['id'])->update(['expected_delivery_date' => '2026-09-03']);

        // And the same on the way back out of the list and the detail.
        $row = collect($this->getJson('/api/purchases')->assertOk()->json('purchases.data'))
            ->firstWhere('id', $res['id']);
        $this->assertSame('2026-09-01', $row['purchase_date']);
        $this->assertSame('2026-09-03', $row['expected_delivery_date']);

        $detail = $this->getJson("/api/purchases/{$res['id']}")->assertOk()->json('purchase');
        $this->assertSame('2026-09-01', $detail['purchase_date']);

        // created_at is a real moment and stays one — it is what tells the
        // owner the order was entered days after the date on it.
        $this->assertNotSame('2026-09-01', substr((string) $detail['created_at'], 0, 10));
    }
}
