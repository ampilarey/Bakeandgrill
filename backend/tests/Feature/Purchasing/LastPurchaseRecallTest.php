<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\InventoryPurchaseUnit;
use App\Models\Purchase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-07: "will the system remember the latest price, brand… by
 * default it should be selected the latest."
 *
 * The brands were already remembered; nothing said what was last paid, or
 * which box it came in, so every line opened blank and somebody had to
 * remember last week's price.
 */
class LastPurchaseRecallTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $bun;

    private InventoryPurchaseUnit $packet6;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->bun = InventoryItem::create([
            'name' => 'Hotdog bun', 'unit' => 'piece', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
        $this->packet6 = InventoryPurchaseUnit::create([
            'inventory_item_id' => $this->bun->id, 'name' => 'Packet', 'base_units' => 6,
        ]);
    }

    private function buy(array $line, string $date = '2026-09-07'): Purchase
    {
        $res = $this->postJson('/api/purchases', [
            'supplier_name_text' => 'The Royal Bakery',
            'purchase_date' => $date,
            'status' => 'received',
            'items' => [$line],
        ])->assertCreated();

        return Purchase::findOrFail($res->json('purchase.id'));
    }

    private function recall(): ?array
    {
        return $this->getJson("/api/inventory/{$this->bun->id}/purchase-units")
            ->assertOk()
            ->json('last_purchase');
    }

    public function test_nothing_to_remember_before_the_first_purchase(): void
    {
        $this->assertNull($this->recall());
    }

    public function test_it_remembers_the_price_the_brand_and_the_box(): void
    {
        // Two packets at MVR 30 a packet: 12 buns, MVR 5 each.
        $this->buy([
            'inventory_item_id' => $this->bun->id,
            'quantity' => 2,
            'unit_cost' => 30,
            'purchase_unit_id' => $this->packet6->id,
            'brand' => 'Royal',
        ]);

        $last = $this->recall();

        $this->assertSame('Royal', $last['brand']);
        $this->assertSame($this->packet6->id, $last['purchase_unit_id']);
        $this->assertSame('Packet', $last['pack_name']);
        $this->assertEqualsWithDelta(6, $last['pack_size'], 0.000001);
        // What a box cost is what somebody types on a line bought by the box.
        $this->assertEqualsWithDelta(30, $last['pack_cost'], 0.001);
        // And per bun, the honest number to compare against another shop.
        $this->assertEqualsWithDelta(5, $last['unit_cost'], 0.000001);
        $this->assertSame('2026-09-07', $last['purchase_date']);
        $this->assertSame('The Royal Bakery', $last['supplier']);
    }

    public function test_the_latest_wins_when_the_brand_or_the_box_changes(): void
    {
        $this->buy([
            'inventory_item_id' => $this->bun->id, 'quantity' => 2, 'unit_cost' => 30,
            'purchase_unit_id' => $this->packet6->id, 'brand' => 'Royal',
        ], '2026-09-01');

        $packet10 = InventoryPurchaseUnit::create([
            'inventory_item_id' => $this->bun->id, 'name' => 'Packet 10', 'base_units' => 10,
        ]);
        $this->buy([
            'inventory_item_id' => $this->bun->id, 'quantity' => 1, 'unit_cost' => 45,
            'purchase_unit_id' => $packet10->id, 'brand' => 'Sunrise',
        ], '2026-09-06');

        $last = $this->recall();

        $this->assertSame('Sunrise', $last['brand']);
        $this->assertSame($packet10->id, $last['purchase_unit_id']);
        $this->assertEqualsWithDelta(45, $last['pack_cost'], 0.001);
        $this->assertEqualsWithDelta(4.5, $last['unit_cost'], 0.000001);
    }

    public function test_a_line_bought_loose_has_no_box_to_remember(): void
    {
        $this->buy([
            'inventory_item_id' => $this->bun->id, 'quantity' => 20, 'unit_cost' => 2.75, 'brand' => 'Royal',
        ]);

        $last = $this->recall();

        $this->assertNull($last['purchase_unit_id']);
        $this->assertNull($last['pack_name']);
        $this->assertNull($last['pack_cost']);
        $this->assertEqualsWithDelta(2.75, $last['unit_cost'], 0.000001);
    }

    public function test_a_pack_resized_since_the_purchase_is_not_matched_back(): void
    {
        $this->buy([
            'inventory_item_id' => $this->bun->id, 'quantity' => 2, 'unit_cost' => 30,
            'purchase_unit_id' => $this->packet6->id, 'brand' => 'Royal',
        ]);

        // The packet is now an 8. The line's snapshot still says 6, and
        // picking today's Packet would restate what was bought.
        $this->packet6->update(['base_units' => 8]);

        $last = $this->recall();

        $this->assertNull($last['purchase_unit_id'], 'no live pack matches the snapshot');
        // The snapshot itself is still reported, so the screen can say so.
        $this->assertSame('Packet', $last['pack_name']);
        $this->assertEqualsWithDelta(6, $last['pack_size'], 0.000001);
    }

    public function test_a_cancelled_order_is_not_what_was_last_bought(): void
    {
        $this->buy([
            'inventory_item_id' => $this->bun->id, 'quantity' => 2, 'unit_cost' => 30,
            'purchase_unit_id' => $this->packet6->id, 'brand' => 'Royal',
        ], '2026-09-01');

        $later = $this->buy([
            'inventory_item_id' => $this->bun->id, 'quantity' => 2, 'unit_cost' => 99,
            'purchase_unit_id' => $this->packet6->id, 'brand' => 'Nonsense',
        ], '2026-09-06');
        $later->update(['status' => 'cancelled']);

        $last = $this->recall();

        $this->assertSame('Royal', $last['brand']);
        $this->assertEqualsWithDelta(30, $last['pack_cost'], 0.001);
    }
}
