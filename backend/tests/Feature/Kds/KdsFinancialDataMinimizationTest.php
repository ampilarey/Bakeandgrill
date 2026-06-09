<?php

declare(strict_types=1);

namespace Tests\Feature\Kds;

use App\Http\Controllers\Api\KdsController;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KdsFinancialDataMinimizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_kitchen_order_payload_omits_financial_fields(): void
    {
        $order = Order::create([
            'order_number' => 'KDS-FIN-1',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 99.99,
            'tax_amount' => 8,
            'discount_amount' => 5,
            'total' => 102.99,
            'total_laar' => 10299,
            'payment_status' => 'unpaid',
        ]);

        $payload = KdsController::formatKitchenOrder($order->fresh());
        $json = json_encode($payload);

        $this->assertArrayNotHasKey('total', $payload);
        $this->assertArrayNotHasKey('subtotal', $payload);
        $this->assertArrayNotHasKey('payment_status', $payload);
        $this->assertStringNotContainsString('"payments"', (string) $json);
    }
}
