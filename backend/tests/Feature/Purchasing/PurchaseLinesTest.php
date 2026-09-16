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
 * Owner, 2026-09-16: "where i can see all the items purchased from a
 * specific store and specific brand?" One flat list of every line bought,
 * each carrying its shop, brand, pack and price, for the table to narrow.
 */
class PurchaseLinesTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $soya;

    private InventoryItem $flour;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $make = fn (string $name, string $unit) => InventoryItem::create([
            'name' => $name, 'unit' => $unit, 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
        $this->soya = $make('Dark soya sauce', 'ml');
        $this->flour = $make('Flour', 'kg');
        // Sauces are filed; flour is not, so one line has a category and one has none.
        $sauces = \App\Models\InventoryCategory::create(['name' => 'Sauces', 'slug' => 'sauces', 'is_active' => true]);
        $this->soya->update(['inventory_category_id' => $sauces->id]);
    }

    private function buy(string $shop, array $lines, string $date): int
    {
        $res = $this->postJson('/api/purchases', [
            'supplier_name_text' => $shop,
            'purchase_date' => $date,
            'items' => $lines,
        ])->assertCreated();

        return (int) $res->json('purchase.id');
    }

    public function test_every_line_comes_back_flat_with_its_shop_brand_and_pack(): void
    {
        $bottle = InventoryPurchaseUnit::create([
            'inventory_item_id' => $this->soya->id, 'name' => 'Bottle 640 ml', 'base_units' => 640,
        ]);
        $today = now()->toDateString();
        $this->buy('Bazaaru', [
            ['inventory_item_id' => $this->soya->id, 'quantity' => 2, 'unit_cost' => 45, 'purchase_unit_id' => $bottle->id, 'brand' => 'Elephant'],
            ['inventory_item_id' => $this->flour->id, 'quantity' => 10, 'unit_cost' => 12],
        ], $today);
        $this->buy('Redwave', [
            ['inventory_item_id' => $this->soya->id, 'quantity' => 1000, 'unit_cost' => 0.05, 'brand' => 'Lee Kum Kee'],
        ], $today);

        $res = $this->getJson('/api/purchases/lines')->assertOk();
        $lines = collect($res->json('lines'));

        $this->assertCount(3, $lines);
        $this->assertFalse($res->json('truncated'));

        $elephant = $lines->firstWhere('brand', 'Elephant');
        $this->assertSame('Bazaaru', $elephant['supplier']);
        $this->assertSame('Dark soya sauce', $elephant['item']);
        $this->assertSame('Sauces', $elephant['category']);
        $this->assertSame('Bottle 640 ml', $elephant['pack_name']);
        // Two bottles of 640 ml at MVR 45 a bottle: stored per ml, shown both ways.
        $this->assertEqualsWithDelta(1280.0, $elephant['quantity'], 0.001);
        $this->assertEqualsWithDelta(2.0, $elephant['pack_quantity'], 0.001);
        $this->assertEqualsWithDelta(45.0, $elephant['pack_cost'], 0.01);
        $this->assertEqualsWithDelta(90.0, $elephant['line_total'], 0.01);

        $loose = $lines->firstWhere('item', 'Flour');
        $this->assertNull($loose['category']);
        $this->assertNull($loose['brand']);
        $this->assertNull($loose['pack_name']);
        $this->assertNull($loose['pack_cost']);
        $this->assertEqualsWithDelta(120.0, $loose['line_total'], 0.01);

        $this->assertSame('Redwave', $lines->firstWhere('brand', 'Lee Kum Kee')['supplier']);
    }

    public function test_the_window_defaults_to_ninety_days_and_can_be_widened(): void
    {
        // Raised today and moved back afterwards: the API refuses a date that
        // far back, but old orders exist all the same.
        $old = now()->subDays(120)->toDateString();
        $id = $this->buy('Bazaaru', [['inventory_item_id' => $this->flour->id, 'quantity' => 1, 'unit_cost' => 1]], now()->toDateString());
        Purchase::whereKey($id)->update(['purchase_date' => $old]);
        $this->buy('Bazaaru', [['inventory_item_id' => $this->flour->id, 'quantity' => 2, 'unit_cost' => 1]], now()->toDateString());

        $this->assertCount(1, $this->getJson('/api/purchases/lines')->json('lines'));
        $this->assertCount(2, $this->getJson('/api/purchases/lines?from=' . now()->subDays(365)->toDateString())->json('lines'));
    }

    public function test_a_deleted_order_leaves_the_list(): void
    {
        $id = $this->buy('Bazaaru', [['inventory_item_id' => $this->flour->id, 'quantity' => 1, 'unit_cost' => 1]], now()->toDateString());
        Purchase::findOrFail($id)->delete();

        $this->assertCount(0, $this->getJson('/api/purchases/lines')->json('lines'));
    }

    public function test_it_needs_the_purchasing_permission(): void
    {
        Sanctum::actingAs($this->makeStaff('cashier'), ['staff']);

        $this->getJson('/api/purchases/lines')->assertForbidden();
    }
}
