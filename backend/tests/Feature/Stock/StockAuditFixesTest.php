<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

use App\Domains\Credit\Services\CreditPolicy;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The stock, buying and vendor audit of 2026-09-03.
 *
 *   S1 a receipt with no price must not average zero into the item's cost
 *   S2 a stock count values its variance and asks why on the big ones
 *   S3 "cheapest supplier" reads both price sources, within a window
 *   S4 usage variance — what the shelf says against what the recipes say
 *   S5 the same reason rule for a manual adjustment
 */
class StockAuditFixesTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private InventoryItem $rice;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->manager = User::create([
            'name' => 'Manager',
            'email' => 'manager@stock.test',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'manager')->value('id'),
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->rice = InventoryItem::create([
            'name' => 'Rice',
            'sku' => 'RICE-1',
            'unit' => 'kg',
            'current_stock' => 10,
            'unit_cost' => 20,
            'is_active' => true,
        ]);
    }

    // ── S1 ────────────────────────────────────────────────────────────

    /** Ten kilos at MVR 20 plus ten with no price must not leave it at MVR 10. */
    public function test_a_receipt_with_no_price_takes_the_stock_and_leaves_the_cost_alone(): void
    {
        $pr = PurchaseRequest::create([
            'request_no' => 'PR-TEST-1',
            'requested_by' => $this->manager->id,
            'status' => 'assigned',
            'title' => 'Kitchen run',
        ]);
        $line = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'inventory_item_id' => $this->rice->id,
            'free_text_name' => 'Rice',
            'requested_qty' => 10,
            'requested_unit' => 'kg',
            'status' => 'bought',
            'actual_qty' => 10,
            'actual_unit_cost_laar' => null,
        ]);

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$pr->id}/items/{$line->id}/verify-received")->assertOk();

        $this->rice->refresh();
        $this->assertSame(20.0, (float) $this->rice->unit_cost, 'cost must be untouched');
        $this->assertSame(20.0, (float) $this->rice->current_stock, 'stock must still arrive');

        $movement = StockMovement::where('inventory_item_id', $this->rice->id)->where('type', 'purchase')->firstOrFail();
        $this->assertNull($movement->unit_cost, 'no price recorded is not a price of zero');
    }

    public function test_a_receipt_with_a_price_still_averages(): void
    {
        $pr = PurchaseRequest::create(['request_no' => 'PR-TEST-2', 'requested_by' => $this->manager->id, 'status' => 'assigned', 'title' => 'Run']);
        $line = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'inventory_item_id' => $this->rice->id,
            'free_text_name' => 'Rice',
            'requested_qty' => 10,
            'requested_unit' => 'kg',
            'status' => 'bought',
            'actual_qty' => 10,
            'actual_unit_cost_laar' => 3000, // MVR 30
        ]);

        Sanctum::actingAs($this->manager, ['staff']);
        $this->postJson("/api/purchase-requests/{$pr->id}/items/{$line->id}/verify-received")->assertOk();

        // (10 × 20 + 10 × 30) ÷ 20 = 25
        $this->assertSame(25.0, (float) $this->rice->fresh()->unit_cost);
    }

    // ── S2 / S5 ───────────────────────────────────────────────────────

    public function test_a_costly_count_difference_must_say_why(): void
    {
        SiteSetting::set('stock_variance_reason_mvr', '100');
        Sanctum::actingAs($this->manager, ['staff']);

        // 6 kg missing at MVR 20 = MVR 120, over the threshold.
        $this->postJson('/api/inventory/stock-count', [
            'counts' => [['inventory_item_id' => $this->rice->id, 'quantity' => 4]],
        ])->assertStatus(422)->assertJsonValidationErrors(['counts.0.notes']);

        // Unchanged until someone says why.
        $this->assertSame(10.0, (float) $this->rice->fresh()->current_stock);

        $this->postJson('/api/inventory/stock-count', [
            'counts' => [['inventory_item_id' => $this->rice->id, 'quantity' => 4, 'notes' => 'Spoiled, binned Friday']],
        ])->assertOk()
            ->assertJsonPath('adjustments.0.variance_value_mvr', 120)
            ->assertJsonPath('variance_value_mvr', 120);

        $this->assertSame(4.0, (float) $this->rice->fresh()->current_stock);
    }

    public function test_a_small_count_difference_needs_no_words(): void
    {
        SiteSetting::set('stock_variance_reason_mvr', '100');
        Sanctum::actingAs($this->manager, ['staff']);

        // 1 kg at MVR 20 is under the threshold.
        $this->postJson('/api/inventory/stock-count', [
            'counts' => [['inventory_item_id' => $this->rice->id, 'quantity' => 9]],
        ])->assertOk()->assertJsonPath('adjustments.0.variance_value_mvr', 20);
    }

    public function test_a_costly_manual_adjustment_must_say_why(): void
    {
        SiteSetting::set('stock_variance_reason_mvr', '100');
        Sanctum::actingAs($this->manager, ['staff']);

        $this->postJson("/api/inventory/{$this->rice->id}/adjust", [
            'quantity' => -8, 'type' => 'waste',
        ])->assertStatus(422)->assertJsonValidationErrors(['notes']);

        $this->postJson("/api/inventory/{$this->rice->id}/adjust", [
            'quantity' => -8, 'type' => 'waste', 'notes' => 'Freezer failed overnight',
        ])->assertOk();
    }

    // ── S3 ────────────────────────────────────────────────────────────

    public function test_cheapest_supplier_sees_buying_list_prices_and_prefers_a_recent_one(): void
    {
        $old = Supplier::create(['name' => 'Old Shop', 'is_active' => true]);
        $recent = Supplier::create(['name' => 'Corner Shop', 'is_active' => true]);

        // A year-old bargain, and a real price from this week.
        SupplierPriceHistory::create([
            'supplier_id' => $old->id, 'inventory_item_id' => $this->rice->id,
            'unit_price' => 5, 'unit' => 'kg', 'recorded_at' => now()->subDays(400)->toDateString(),
        ]);
        SupplierPriceHistory::create([
            'supplier_id' => $recent->id, 'inventory_item_id' => $this->rice->id,
            'unit_price' => 18, 'unit' => 'kg', 'recorded_at' => now()->subDays(3)->toDateString(),
        ]);

        Sanctum::actingAs($this->manager, ['staff']);

        $this->getJson("/api/inventory/{$this->rice->id}/cheapest-supplier")
            ->assertOk()
            ->assertJsonPath('supplier.name', 'Corner Shop')
            ->assertJsonPath('supplier.within_window', true);

        // Ask for all time and the old bargain wins again.
        $this->getJson("/api/inventory/{$this->rice->id}/cheapest-supplier?days=0")
            ->assertOk()
            ->assertJsonPath('supplier.name', 'Old Shop');
    }

    // ── S4 ────────────────────────────────────────────────────────────

    public function test_usage_variance_values_what_the_counts_had_to_correct(): void
    {
        // Sold 4 kg by recipe, then a count found 3 kg missing on top.
        StockMovement::create([
            'inventory_item_id' => $this->rice->id, 'type' => 'sale', 'quantity' => -4,
            'balance_after' => 6, 'unit_cost' => 20, 'reference_type' => 'order', 'reference_id' => 1,
        ]);
        StockMovement::create([
            'inventory_item_id' => $this->rice->id, 'type' => 'adjustment', 'quantity' => -3,
            'balance_after' => 3, 'unit_cost' => 20, 'reference_type' => 'stock_count',
        ]);

        Sanctum::actingAs($this->manager, ['staff']);

        $res = $this->getJson('/api/reports/usage-variance?from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString());
        $res->assertOk()
            ->assertJsonPath('items.0.name', 'Rice')
            ->assertJsonPath('items.0.recipe_usage', 4)
            ->assertJsonPath('items.0.unexplained', -3)
            ->assertJsonPath('items.0.unexplained_value_mvr', -60)
            ->assertJsonPath('total_loss_mvr', 60);
    }

    /** A settings page the owner can reach — the same shape as the credit one. */
    public function test_the_variance_threshold_is_a_setting(): void
    {
        $this->assertSame(500.0, \App\Domains\Inventory\Services\StockVariancePolicy::thresholdMvr());
        SiteSetting::set('stock_variance_reason_mvr', '250');
        $this->assertSame(250.0, \App\Domains\Inventory\Services\StockVariancePolicy::thresholdMvr());
        // Unrelated, but proves the credit policy reader still stands.
        $this->assertSame(CreditPolicy::MODE_OPEN, CreditPolicy::mode());
    }
}
