<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\User;
use App\Models\WasteLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The owner's accounting model, on one sheet.
 *
 * "item purchased, salary, rent ect.. comes under each month cost, and income
 * is from the sales, profit and loss should be calculated based on this."
 * One month, one page: income in, ingredients and expenses out, profit at the
 * bottom, last month beside it.
 */
class MonthlySheetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function paidOrder(float $food): void
    {
        $order = Order::factory()->create([
            'status' => 'completed',
            'payment_status' => 'paid',
            'subtotal' => $food,
            'subtotal_laar' => (int) round($food * 100),
            'tax_amount' => round($food * 0.08, 2),
            'tax_laar' => (int) round($food * 8),
            'total' => round($food * 1.08, 2),
            'total_laar' => (int) round($food * 108),
            'created_at' => now(),
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => Item::factory()->create(['base_price' => $food])->id,
            'item_name' => 'Roshi',
            'quantity' => 1,
            'unit_price' => $food,
            'total_price' => $food,
        ]);
    }

    private function receivedPurchase(float $qty, float $unitCost): void
    {
        $res = $this->postJson('/api/purchases', [
            'supplier_id' => Supplier::firstOrCreate(['name' => 'Fahi Store'], ['is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'draft',
            'items' => [[
                'inventory_item_id' => InventoryItem::firstOrCreate(['sku' => 'RICE-1'], [
                    'name' => 'Rice', 'unit' => 'kg', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
                ])->id,
                'quantity' => $qty,
                'unit_cost' => $unitCost,
            ]],
        ])->assertCreated();

        $po = Purchase::with('items')->findOrFail((int) $res->json('purchase.id'));
        $this->postJson("/api/purchases/{$po->id}/approve")->assertOk();
        $this->postJson("/api/purchases/{$po->id}/receive", [
            'items' => $po->items->map(fn ($i) => [
                'purchase_item_id' => $i->id, 'received_quantity' => $qty,
            ])->all(),
        ])->assertOk();
    }

    private function rent(float $amount): void
    {
        Expense::create([
            'expense_number' => 'EXP-MS-' . uniqid(),
            'expense_category_id' => ExpenseCategory::firstOrCreate(
                ['slug' => 'rent'],
                ['name' => 'Rent', 'is_active' => true],
            )->id,
            'user_id' => User::factory()->create()->id,
            'description' => 'Rent',
            'amount_laar' => (int) round($amount * 100),
            'amount' => $amount,
            'expense_date' => now()->toDateString(),
            'status' => 'approved',
        ]);
    }

    private function sheet(): array
    {
        return $this->getJson('/api/reports/finance/monthly-sheet?month=' . now()->format('Y-m'))
            ->assertOk()
            ->json();
    }

    public function test_the_sheet_is_the_owners_model(): void
    {
        // MVR 1000 of food sold, MVR 200 of rice bought, MVR 300 rent.
        // Profit = 1000 − 200 − 300 = 500. The 80 GST belongs to MIRA.
        $this->paidOrder(1000);
        $this->receivedPurchase(10, 20);
        $this->rent(300);

        $sheet = $this->sheet();

        $this->assertEqualsWithDelta(1080.0, $sheet['income']['takings_incl_gst'], 0.01);
        $this->assertEqualsWithDelta(80.0, $sheet['income']['gst_for_mira'], 0.01);
        $this->assertEqualsWithDelta(1000.0, $sheet['income']['total'], 0.01);
        $this->assertEqualsWithDelta(200.0, $sheet['ingredients'], 0.01);
        $this->assertEqualsWithDelta(300.0, $sheet['expenses']['total'], 0.01);
        $this->assertEqualsWithDelta(500.0, $sheet['profit'], 0.01);
    }

    public function test_last_month_rides_along_for_comparison(): void
    {
        $this->paidOrder(1000);

        $sheet = $this->sheet();

        $this->assertSame(
            now()->subMonthNoOverflow()->format('Y-m'),
            $sheet['previous']['month'],
        );
        // Nothing happened last month in this fixture — an honest zero, not an error.
        $this->assertEqualsWithDelta(0.0, $sheet['previous']['profit'], 0.01);
        $this->assertArrayNotHasKey('previous', $sheet['previous']);
    }

    public function test_waste_is_shown_but_never_subtracted_twice(): void
    {
        /*
         * The wasted rice was bought — its money is inside `ingredients`
         * already. A waste line that subtracted again would punish the same
         * mistake twice.
         */
        $this->paidOrder(1000);
        $this->receivedPurchase(10, 20);
        WasteLog::create([
            'inventory_item_id' => InventoryItem::where('sku', 'RICE-1')->value('id'),
            'user_id' => User::factory()->create()->id,
            'quantity' => 2,
            'unit' => 'kg',
            'cost_estimate' => 40,
            'reason' => 'spoilage',
        ]);

        $sheet = $this->sheet();

        $this->assertEqualsWithDelta(40.0, $sheet['waste_info'], 0.01);
        $this->assertEqualsWithDelta(800.0, $sheet['profit'], 0.01);
    }

    public function test_the_stock_change_line_explains_a_big_month_end_buy(): void
    {
        /*
         * Buy MVR 200 of rice and use none of it: the purchases-model profit
         * drops by 200, but the shelves grew by the same 200 — and the
         * usage-adjusted profit says so.
         */
        $this->paidOrder(1000);
        $this->receivedPurchase(10, 20);

        $sheet = $this->sheet();

        $this->assertEqualsWithDelta(800.0, $sheet['profit'], 0.01);
        $this->assertEqualsWithDelta(200.0, $sheet['stock_change']['change'], 0.5);
        $this->assertEqualsWithDelta(1000.0, $sheet['profit_by_usage'], 0.5);
    }

    public function test_a_bad_month_string_is_refused(): void
    {
        $this->getJson('/api/reports/finance/monthly-sheet?month=nonsense')->assertStatus(422);
        $this->getJson('/api/reports/finance/monthly-sheet?month=2026-13')->assertStatus(422);
    }

    public function test_the_pnl_no_longer_subtracts_waste_it_already_counted(): void
    {
        $this->paidOrder(1000);
        $this->receivedPurchase(10, 20);
        WasteLog::create([
            'inventory_item_id' => InventoryItem::where('sku', 'RICE-1')->value('id'),
            'user_id' => User::factory()->create()->id,
            'quantity' => 2,
            'unit' => 'kg',
            'cost_estimate' => 40,
            'reason' => 'spoilage',
        ]);

        $from = now()->subDays(7)->toDateString();
        $to = now()->addDay()->toDateString();
        $pnl = $this->getJson("/api/reports/finance/profit-and-loss?from={$from}&to={$to}")
            ->assertOk()
            ->json();

        $this->assertEqualsWithDelta(40.0, $pnl['waste_cost'], 0.01);
        $this->assertEqualsWithDelta(800.0, $pnl['operating_profit'], 0.01);
    }
}
