<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Payments\Services\PaymentService;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

/**
 * Regression (2026-08 audit #3): when a BML initiation retry reuses an
 * existing 'created' payment row, the gateway call MUST use the persisted
 * local_id — the webhook resolves payments by localId, so sending a freshly
 * generated one would leave a paid transaction unreconciled.
 */
class BmlLocalIdRetryTest extends TestCase
{
    use RefreshDatabase;

    protected function makeBmlOrder(): Order
    {
        $item = Item::create([
            'name' => 'Test Burger',
            'base_price' => 50,
            'is_active' => true,
            'is_available' => true,
        ]);

        $order = Order::create([
            'order_number' => 'ORD-BML-RETRY',
            'type' => 'online_pickup',
            'status' => 'pending',
            'subtotal' => 50,
            'total' => 50,
        ]);
        $order->items()->create([
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 1,
            'unit_price' => 50,
            'total_price' => 50,
        ]);

        return $order;
    }

    public function test_retry_reuses_persisted_local_id_for_created_payment(): void
    {
        $order = $this->makeBmlOrder();
        $idempotencyKey = 'bml:init:test-retry';

        // First attempt: row persisted, but gateway call failed before the
        // payment reached 'initiated' — simulated by creating the row directly.
        $stale = Payment::create([
            'idempotency_key' => $idempotencyKey,
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 50,
            'amount_laar' => 5000,
            'local_id' => 'BGSTALELOCAL123',
            'status' => 'created',
            'processed_at' => now(),
        ]);

        $capturedLocalId = null;
        $mock = Mockery::mock(BmlConnectService::class);
        $mock->shouldReceive('normalizeLocalId')->andReturnUsing(
            fn (string $id) => substr(preg_replace('/[^A-Za-z0-9]/', '', $id), 0, 50),
        );
        $mock->shouldReceive('createPayment')
            ->once()
            ->andReturnUsing(function (int $amount, string $localId) use (&$capturedLocalId) {
                $capturedLocalId = $localId;

                return [
                    'transaction_id' => 'TXN-RETRY-1',
                    'payment_url' => 'https://bml.example/pay/TXN-RETRY-1',
                ];
            });
        $this->app->instance(BmlConnectService::class, $mock);

        $result = app(PaymentService::class)->initiateBmlPayment($order, 5000, $idempotencyKey);

        // The gateway must have been given the STORED local_id, and the
        // response must reference the same id the webhook will look up.
        $this->assertSame('BGSTALELOCAL123', $capturedLocalId);
        $this->assertSame('BGSTALELOCAL123', $result['local_id']);
        $this->assertSame($stale->id, $result['payment_id']);
        $this->assertSame('BGSTALELOCAL123', $stale->fresh()->local_id);
    }
}
