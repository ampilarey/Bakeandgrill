<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Order;
use App\Models\Refund;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * GST audit, 2026-09-26: profit and loss.
 *
 * A sale refunded in full was left out of gross but its refund still came
 * off, so it was taken away twice. The refund also carried its GST back out
 * of income although that GST had already left with the tax line. A refund
 * of a payment that arrived after its order was cancelled came off a sale
 * that was never counted. And written-off shop credit was counted as income
 * with no cost anywhere.
 */
class ProfitAndLossCorrectionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->owner = $this->makeOwner(), ['staff']);
    }

    private $owner;

    /** MVR 100 of food plus MVR 8 GST. */
    private function order(string $status): Order
    {
        return Order::factory()->create([
            'status' => $status,
            'paid_at' => $status === 'cancelled' ? null : Carbon::now(),
            'subtotal' => 100, 'subtotal_laar' => 10000,
            'tax_amount' => 8, 'tax_laar' => 800,
            'total' => 108, 'total_laar' => 10800,
        ]);
    }

    private function refund(Order $order, float $amount, string $by = 'staff'): Refund
    {
        $refund = new Refund;
        $refund->forceFill([
            'order_id' => $order->id,
            'user_id' => $this->owner->id,
            'amount' => $amount,
            'status' => 'approved',
            'reason' => 'test',
            'initiated_by' => $by,
        ])->save();

        return $refund;
    }

    private function pnl(): array
    {
        $day = now()->toDateString();

        return $this->getJson("/api/reports/finance/profit-and-loss?from={$day}&to={$day}")->assertOk()->json();
    }

    public function test_a_sale_refunded_in_full_nets_to_nothing(): void
    {
        $this->refund($this->order('refunded'), 108);

        $pnl = $this->pnl();

        $this->assertEqualsWithDelta(108.0, $pnl['revenue']['gross'], 0.001);
        $this->assertEqualsWithDelta(108.0, $pnl['revenue']['refunds'], 0.001);
        $this->assertEqualsWithDelta(8.0, $pnl['revenue']['refund_tax'], 0.001);
        $this->assertEqualsWithDelta(0.0, $pnl['revenue']['net'], 0.001);
    }

    public function test_a_part_refund_takes_off_only_the_income_part(): void
    {
        $this->order('completed');
        $this->refund($this->order('partially_refunded'), 54);

        $pnl = $this->pnl();

        // 216 gross, 16 GST, 54 refunded of which 4 was GST: 200 − 50 = 150.
        $this->assertEqualsWithDelta(150.0, $pnl['revenue']['net'], 0.001);
    }

    public function test_a_late_payment_refund_on_a_cancelled_order_is_left_out(): void
    {
        $this->order('completed');
        $this->refund($this->order('cancelled'), 108, 'system');

        $pnl = $this->pnl();

        $this->assertEqualsWithDelta(0.0, $pnl['revenue']['refunds'], 0.001);
        $this->assertEqualsWithDelta(100.0, $pnl['revenue']['net'], 0.001);
    }

    public function test_written_off_credit_is_a_bad_debt(): void
    {
        $this->order('completed');
        $customer = Customer::factory()->create();
        CustomerCreditLedger::create([
            'customer_id' => $customer->id,
            'type' => 'adjustment',
            'amount_laar' => -2500,
            'balance_after_laar' => 0,
            'method' => 'writeoff',
            'recorded_by' => $this->owner->id,
            'notes' => 'Write-off: shop closed',
        ]);

        $pnl = $this->pnl();

        $this->assertEqualsWithDelta(25.0, $pnl['bad_debts'], 0.001);
        $this->assertEqualsWithDelta(75.0, $pnl['operating_profit'], 0.001);
    }
}
