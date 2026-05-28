<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Payments\Services\PaymentService;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentServiceOrderTotalTest extends TestCase
{
    use RefreshDatabase;

    public function test_remaining_balance_prefers_total_laar_over_decimal_total(): void
    {
        $order = Order::factory()->pending()->create([
            'total' => 999.99,
            'total_laar' => 100,
        ]);

        $remaining = app(PaymentService::class)->getRemainingBalanceLaar($order);

        $this->assertSame(100, $remaining);
    }

    public function test_remaining_balance_falls_back_to_decimal_total_when_laar_missing(): void
    {
        $order = Order::factory()->pending()->create([
            'total' => 12.34,
            'total_laar' => null,
        ]);

        $remaining = app(PaymentService::class)->getRemainingBalanceLaar($order);

        $this->assertSame(1234, $remaining);
    }
}
