<?php

declare(strict_types=1);

namespace Tests\Feature\Reports;

use App\Domains\Telegram\Services\TelegramCommands;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Owner, 2026-10-22: an order paid by its online link sat at Ready, waiting
 * to be picked up, and the Telegram "Today" report left it out of sales,
 * orders and payments. A fully paid order is a sale at whatever stage it is;
 * an unpaid ticket and a cancelled order still are not.
 */
class PaidOrderStillInKitchenCountsTest extends TestCase
{
    use RefreshDatabase;

    private function order(string $status, string $paymentStatus, float $total, string $type = 'online_pickup'): Order
    {
        return Order::factory()->create([
            'type' => $type,
            'status' => $status,
            'payment_status' => $paymentStatus,
            'subtotal' => $total,
            'tax_amount' => 0,
            'total' => $total,
            'total_laar' => (int) round($total * 100),
            'paid_at' => $paymentStatus === 'paid' ? now() : null,
        ]);
    }

    private function pay(Order $order, string $method, float $amount): void
    {
        Payment::create([
            'order_id' => $order->id,
            'method' => $method,
            'amount' => $amount,
            'amount_laar' => (int) round($amount * 100),
            'status' => 'paid',
        ]);
    }

    public function test_a_paid_order_waiting_to_be_picked_up_is_in_the_day_report(): void
    {
        $ready = $this->order('ready', 'paid', 290.00);
        $this->pay($ready, 'bml', 290.00);
        $cooking = $this->order('in_progress', 'paid', 45.00, 'delivery');
        $this->pay($cooking, 'bml', 45.00);
        $counter = $this->order('completed', 'paid', 25.00, 'takeaway');
        $this->pay($counter, 'cash', 25.00);

        // Not sales: a ticket still unpaid, and an order paid then cancelled.
        $this->order('ready', 'unpaid', 99.00, 'dine_in');
        $this->pay($this->order('cancelled', 'paid', 77.00), 'bml', 77.00);

        $telegram = app(TelegramCommands::class);
        $summary = $telegram->dailySummary(now()->toDateString());

        $this->assertSame(3, (int) $summary['orders']);
        $this->assertEqualsWithDelta(360.00, (float) $summary['revenue'], 0.001);
        $this->assertEqualsWithDelta(335.00, $telegram->paymentsByMethod(Carbon::now())['bml'], 0.001);

        $lines = implode("\n", $telegram->dayReportLines(Carbon::now()));
        $this->assertStringContainsString('Online pickup: 1', $lines);
        $this->assertStringContainsString('BML online', $lines);
    }
}
