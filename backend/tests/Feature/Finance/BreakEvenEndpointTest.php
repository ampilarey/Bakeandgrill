<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Domains\Reporting\Services\BreakEvenService;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\GstSetting;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Purchase;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The break-even estimate seeded from real trailing figures.
 *
 * Endpoint auth/shape follows ReportEndpointsTest; the numbers are checked
 * against the service directly, and the pure arithmetic lives in
 * BreakEvenCalculatorTest. The one thing worth an integration test is that the
 * seed is GST-EXCLUSIVE on both sides (AUDIT_FINANCE_2026-08-26.md F1/F2) —
 * that is exactly the distortion this tool exists to avoid inheriting.
 */
class BreakEvenEndpointTest extends TestCase
{
    use RefreshDatabase;

    private function configureGst(): void
    {
        GstSetting::query()->updateOrCreate(['id' => 1], [
            'gst_registered' => true,
            'default_tax_rate_bp' => 800,
            'tax_inclusive' => false,
            'currency' => 'MVR',
            'sector' => 'general',
            'accounting_basis' => 'hybrid',
            'seller_name' => 'Break-even Test',
        ]);
    }

    /** One paid retail order: MVR $food of food + 8% GST. */
    private function paidOrder(float $food, string $day): Order
    {
        $item = Item::factory()->create(['base_price' => $food]);
        $order = Order::factory()->create([
            'status' => 'completed',
            'payment_status' => 'paid',
            'subtotal' => $food,
            'subtotal_laar' => (int) round($food * 100),
            'tax_amount' => round($food * 0.08, 2),
            'tax_laar' => (int) round($food * 8),
            'total' => round($food * 1.08, 2),
            'total_laar' => (int) round($food * 108),
            'created_at' => Carbon::parse($day),
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 1,
            'unit_price' => $food,
            'total_price' => $food,
        ]);

        return $order;
    }

    public function test_the_seed_uses_revenue_net_of_output_gst(): void
    {
        // THE test. Two MVR 100 food orders bill MVR 216 including GST, but the
        // break-even revenue must be built on the MVR 200 that is actually
        // income — not the tax we hand to MIRA.
        $this->configureGst();
        $this->paidOrder(100, '2026-08-02');
        $this->paidOrder(100, '2026-08-03');

        $estimate = app(BreakEvenService::class)->estimate(
            Carbon::parse('2026-08-01')->startOfDay(),
            Carbon::parse('2026-08-31')->endOfDay(),
        );

        $this->assertSame(200.0, $estimate['revenue_ex_gst'], 'revenue must exclude the 8% GST');
    }

    public function test_variable_cost_uses_ex_tax_purchase_value(): void
    {
        // Input GST on purchases is reclaimable, so the real cost of stock is
        // the ex-tax subtotal, not the gross the supplier billed.
        $this->configureGst();
        Purchase::create([
            'purchase_number' => 'PO-BE-1', 'purchase_date' => '2026-08-05',
            'status' => 'received',
            'subtotal' => 500,
            'tax_amount' => 40,
            'total' => 540,
        ]);

        $estimate = app(BreakEvenService::class)->estimate(
            Carbon::parse('2026-08-01')->startOfDay(),
            Carbon::parse('2026-08-31')->endOfDay(),
        );

        $this->assertSame(500.0, $estimate['variable_cost'], 'COGS must be ex input tax');
    }

    public function test_it_computes_a_break_even_from_fixed_costs_and_margin(): void
    {
        // MVR 1000 food revenue (ex-GST), MVR 600 stock → 40% margin. MVR 300
        // of rent over the same month → break-even ≈ 300 / 0.40 = 750/month.
        $this->configureGst();
        $this->paidOrder(1000, '2026-08-10');
        Purchase::create([
            'purchase_number' => 'PO-BE-2', 'purchase_date' => '2026-08-06', 'status' => 'received',
            'subtotal' => 600, 'tax_amount' => 48, 'total' => 648,
        ]);
        $category = ExpenseCategory::create(['slug' => 'rent', 'name' => 'Rent', 'is_active' => true]);
        Expense::create([
            'expense_number' => 'EXP-BE-1',
            'expense_category_id' => $category->id,
            'user_id' => User::factory()->create()->id,
            'description' => 'Rent',
            'amount_laar' => 30000,
            'amount' => 300,
            'expense_date' => '2026-08-01',
            'status' => 'approved',
        ]);

        // A 30-day window so fixed cost needs no normalising.
        $estimate = app(BreakEvenService::class)->estimate(
            Carbon::parse('2026-08-01')->startOfDay(),
            Carbon::parse('2026-08-30')->endOfDay(),
        );

        $this->assertSame(0.40, $estimate['contribution_margin_ratio']);
        $this->assertSame(750.0, $estimate['break_even_revenue_monthly']);
    }

    public function test_selling_below_cost_reports_no_break_even(): void
    {
        // MVR 100 revenue against MVR 150 of stock — a negative margin. The
        // estimate must say "not reachable", not emit a target.
        $this->configureGst();
        $this->paidOrder(100, '2026-08-10');
        Purchase::create([
            'purchase_number' => 'PO-BE-3', 'purchase_date' => '2026-08-06', 'status' => 'received',
            'subtotal' => 150, 'tax_amount' => 12, 'total' => 162,
        ]);

        $estimate = app(BreakEvenService::class)->estimate(
            Carbon::parse('2026-08-01')->startOfDay(),
            Carbon::parse('2026-08-30')->endOfDay(),
        );

        $this->assertLessThan(0, $estimate['contribution_margin_ratio']);
        $this->assertNull($estimate['break_even_revenue_monthly']);
        $this->assertNull($estimate['currently_covers']);
    }

    public function test_endpoint_requires_the_financial_reports_permission(): void
    {
        $this->getJson('/api/reports/finance/break-even')->assertStatus(401);
    }

    public function test_owner_can_read_the_endpoint(): void
    {
        $this->configureGst();
        $owner = $this->makeOwner();

        $this->getJson('/api/reports/finance/break-even', $this->staffHeaders($owner))
            ->assertOk()
            ->assertJsonStructure([
                'revenue_ex_gst',
                'variable_cost',
                'fixed_cost',
                'contribution_margin_ratio',
                'break_even_revenue_monthly',
                'break_even_revenue_daily',
                'components',
            ]);
    }
}
