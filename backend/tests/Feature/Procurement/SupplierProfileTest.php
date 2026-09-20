<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Models\SupplierRating;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-20: "in suppliers list, when clicked, can u add advanced
 * features to know all the po and items bought from each supplier".
 */
class SupplierProfileTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $agora;

    private Supplier $fahi;

    private InventoryItem $flour;

    private InventoryItem $eggs;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->agora = Supplier::create(['name' => 'Agora', 'phone' => '3330000', 'bank_account_number' => '7730000123456']);
        $this->fahi = Supplier::create(['name' => 'Fahi Store']);
        $this->flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 12, 'is_active' => true]);
        $this->eggs = InventoryItem::create(['name' => 'Eggs', 'unit' => 'pcs', 'unit_cost' => 2, 'is_active' => true]);
    }

    /** @param list<array{InventoryItem, float, float, ?string}> $lines item, qty, unit cost, brand */
    private function order(Supplier $s, string $number, string $date, string $status, array $lines, ?string $expected = null, ?string $actual = null): Purchase
    {
        $total = array_sum(array_map(fn ($l) => $l[1] * $l[2], $lines));
        $po = Purchase::create([
            'purchase_number' => $number,
            'supplier_id' => $s->id,
            'purchase_date' => $date,
            'expected_delivery_date' => $expected,
            'actual_delivery_date' => $actual,
            'status' => $status,
            'subtotal' => $total,
            'total' => $total,
        ]);
        foreach ($lines as [$item, $qty, $cost, $brand]) {
            PurchaseItem::create([
                'purchase_id' => $po->id,
                'inventory_item_id' => $item->id,
                'quantity' => $qty,
                'unit_cost' => $cost,
                'total_cost' => $qty * $cost,
                'brand' => $brand,
            ]);
        }

        return $po;
    }

    private function seedAgora(): void
    {
        $d = fn (int $daysAgo) => now()->subDays($daysAgo)->toDateString();
        // Three real orders, one draft, one cancelled. Flour 10 → 12, eggs once.
        $this->order($this->agora, 'PO-1', $d(60), 'received', [[$this->flour, 10, 10, 'Prima']], $d(58), $d(58));
        $this->order($this->agora, 'PO-2', $d(30), 'received', [[$this->flour, 10, 11, 'Prima'], [$this->eggs, 30, 2, null]], $d(28), $d(29));
        $this->order($this->agora, 'PO-3', $d(2), 'ordered', [[$this->flour, 5, 12, 'Pillsbury']]);
        $this->order($this->agora, 'PO-4', $d(1), 'draft', [[$this->flour, 50, 12, null]]);
        $this->order($this->agora, 'PO-5', $d(20), 'cancelled', [[$this->eggs, 90, 2, null]]);
        // Somebody else sells flour cheaper, and eggs dearer.
        SupplierPriceHistory::create(['supplier_id' => $this->fahi->id, 'inventory_item_id' => $this->flour->id, 'unit_price' => 11.5, 'unit' => 'kg', 'recorded_at' => $d(5)]);
        SupplierPriceHistory::create(['supplier_id' => $this->fahi->id, 'inventory_item_id' => $this->eggs->id, 'unit_price' => 2.5, 'unit' => 'pcs', 'recorded_at' => $d(5)]);
    }

    public function test_overview_counts_only_orders_that_were_placed_and_says_how_often_and_how_much(): void
    {
        $this->seedAgora();
        $manager = $this->makeManager();
        SupplierRating::create(['supplier_id' => $this->agora->id, 'user_id' => $manager->id, 'quality_score' => 5, 'delivery_score' => 3, 'accuracy_score' => 4, 'price_score' => 4]);

        Sanctum::actingAs($manager, ['staff']);
        $res = $this->getJson("/api/purchasing/suppliers/{$this->agora->id}/overview")->assertOk();

        $this->assertSame('Agora', $res->json('supplier.name'));
        $this->assertSame('7730000123456', $res->json('supplier.bank_account_number'));

        // 100 + 170 + 60. The draft and the cancelled order are not money.
        $this->assertSame(3, $res->json('orders.count'));
        $this->assertEquals(330, $res->json('orders.spend'));
        $this->assertEquals(110, $res->json('orders.average'));
        $this->assertSame(now()->subDays(2)->toDateString(), $res->json('orders.last_date'));
        // 58 days across two gaps.
        $this->assertEquals(29, $res->json('orders.days_between'));
        // Two orders had both dates; one arrived on time, one a day early.
        $this->assertSame(['on_time' => 2, 'timed' => 2, 'rate' => 100], $res->json('orders.on_time'));
        $this->assertSame(['draft' => 1, 'ordered' => 1, 'partial' => 0, 'received' => 2, 'cancelled' => 1], $res->json('orders.by_status'));
        $this->assertSame(1, $res->json('orders.open'));

        $this->assertSame(2, $res->json('items.count'));
        $this->assertSame(['Flour', 'Eggs'], array_column($res->json('items.top'), 'name'));
        $this->assertEquals(270, $res->json('items.top.0.spend'));

        $this->assertCount(12, $res->json('monthly'));
        $this->assertEquals(330, array_sum(array_column($res->json('monthly'), 'spend')));

        $this->assertSame(1, $res->json('ratings.count'));
        $this->assertEquals(4.0, $res->json('ratings.overall'));
    }

    public function test_items_bought_say_how_often_what_it_cost_first_and_last_and_who_is_cheaper(): void
    {
        $this->seedAgora();

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $res = $this->getJson("/api/purchasing/suppliers/{$this->agora->id}/items")->assertOk();

        // Biggest spend first.
        $this->assertSame(['Flour', 'Eggs'], array_column($res->json('items'), 'name'));

        $f = $res->json('items.0');
        $this->assertSame(3, $f['orders']);
        $this->assertEquals(25, $f['quantity']);
        $this->assertEquals(270, $f['spend']);
        $this->assertEquals(10, $f['first']['price']);
        $this->assertEquals(12, $f['last']['price']);
        $this->assertSame('Pillsbury', $f['last']['brand']);
        $this->assertSame('PO-3', $f['last']['purchase_number']);
        $this->assertEquals(20, $f['change_pct']);
        $this->assertSame('Fahi Store', $f['elsewhere']['supplier']);
        $this->assertEquals(11.5, $f['elsewhere']['price']);
        $this->assertTrue($f['elsewhere']['cheaper']);
        $this->assertSame(['PO-1', 'PO-2', 'PO-3'], array_column($f['points'], 'purchase_number'));
        $this->assertEquals([10, 11, 12], array_column($f['points'], 'price'));

        $e = $res->json('items.1');
        $this->assertSame(1, $e['orders']);
        $this->assertNull($e['change_pct']);
        $this->assertFalse($e['elsewhere']['cheaper']);
    }

    public function test_the_purchase_list_narrows_to_one_supplier_and_a_date_window(): void
    {
        $this->seedAgora();
        $this->order($this->fahi, 'PO-F1', now()->subDays(3)->toDateString(), 'received', [[$this->eggs, 10, 2.5, null]]);

        Sanctum::actingAs($this->makeManager(), ['staff']);

        $numbers = array_column($this->getJson("/api/purchases?supplier_id={$this->agora->id}")->assertOk()->json('purchases.data'), 'purchase_number');
        $this->assertEqualsCanonicalizing(['PO-1', 'PO-2', 'PO-3', 'PO-4', 'PO-5'], $numbers);

        $from = now()->subDays(10)->toDateString();
        $numbers = array_column($this->getJson("/api/purchases?supplier_id={$this->agora->id}&from={$from}")->assertOk()->json('purchases.data'), 'purchase_number');
        $this->assertEqualsCanonicalizing(['PO-3', 'PO-4'], $numbers);
    }

    public function test_an_unknown_supplier_is_not_found_and_kitchen_staff_may_not_look(): void
    {
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $this->getJson('/api/purchasing/suppliers/999999/overview')->assertNotFound();

        Sanctum::actingAs($this->makeKitchenStaff(), ['staff']);
        $this->getJson("/api/purchasing/suppliers/{$this->agora->id}/overview")->assertForbidden();
        $this->getJson("/api/purchasing/suppliers/{$this->agora->id}/items")->assertForbidden();
    }
}
