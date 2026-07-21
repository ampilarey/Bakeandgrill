<?php

declare(strict_types=1);

namespace Tests\Unit\Payments;

use App\Domains\Payments\Services\PaymentAllocationService;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * FIX 11 — cash overpay must not inflate applied `amount`; overpay is
 * expressed via the (optional) tendered_amount column instead.
 */
class CashTenderedAmountTest extends TestCase
{
    use RefreshDatabase;

    protected function makeCashOrder(int $totalLaar): Order
    {
        return Order::create([
            'order_number' => 'CASH-TEND-' . $totalLaar,
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => $totalLaar / 100,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => $totalLaar / 100,
            'total_laar' => $totalLaar,
        ]);
    }

    public function test_cash_only_cap_rejects_applied_amount_over_remaining_plus_one_laari(): void
    {
        $order = $this->makeCashOrder(1000); // MVR 10.00

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $this->expectExceptionMessage('far exceeds remaining balance');

        app(PaymentAllocationService::class)->assertTenderCap($order, [
            ['method' => 'cash', 'amount' => 20.00],
        ]);
    }

    public function test_cash_applied_amount_within_one_laari_of_remaining_passes(): void
    {
        $order = $this->makeCashOrder(1000);

        // Exactly remaining + 1 laari — permitted for rounding drift only.
        app(PaymentAllocationService::class)->assertTenderCap($order, [
            ['method' => 'cash', 'amount' => 10.01],
        ]);

        $this->assertTrue(true, 'cap allows +1 laari rounding tolerance');
    }
}
