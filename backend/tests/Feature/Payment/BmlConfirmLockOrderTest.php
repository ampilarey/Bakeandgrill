<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Payments\Services\PaymentService;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Confirm payment must lock Order → Payment (same as initiation) and retry deadlocks.
 */
class BmlConfirmLockOrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_confirm_payment_locks_order_before_payment(): void
    {
        config([
            'bml.webhook_secret' => 'test-secret',
            'bml.enforce_signature' => true,
            'bml.base_url' => 'https://api.merchants.bankofmaldives.com.mv/public',
        ]);

        $order = Order::create([
            'order_number' => 'LOCK-ORD-1',
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'payment_status' => 'unpaid',
            'subtotal' => 50,
            'total' => 50,
            'total_laar' => 5000,
        ]);

        $payment = Payment::create([
            'idempotency_key' => 'bml:init:lock-1',
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 50,
            'amount_laar' => 5000,
            'local_id' => 'BGLOCKORD1',
            'provider_transaction_id' => 'TXN-LOCK-1',
            'status' => 'initiated',
            'processed_at' => now(),
        ]);

        $seen = [];
        DB::listen(function ($query) use (&$seen): void {
            $sql = strtolower($query->sql);
            // Capture primary-key lookups used for row locks (SQLite may omit FOR UPDATE).
            if (!preg_match('/from ["`]?(orders|payments)["`]?/s', $sql, $m)) {
                return;
            }
            if (!str_contains($sql, 'where') || !str_contains($sql, 'id')) {
                return;
            }
            $seen[] = $m[1];
        });

        $payload = [
            'transactionId' => 'TXN-LOCK-1',
            'localId' => $payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => '50.00',
            'currency' => 'MVR',
        ];

        // Call confirmPaymentOnce directly so findByLocalId noise is excluded.
        $method = new ReflectionMethod(PaymentService::class, 'confirmPaymentOnce');
        $method->setAccessible(true);
        $method->invoke(app(PaymentService::class), $payment, $payload);

        $this->assertSame('confirmed', $payment->fresh()->status);
        $this->assertNotEmpty($seen, 'Expected order/payment lock queries to be recorded');

        $firstOrder = array_search('orders', $seen, true);
        $firstPayment = array_search('payments', $seen, true);
        $this->assertNotFalse($firstOrder, 'Order lock/select missing');
        $this->assertNotFalse($firstPayment, 'Payment lock/select missing');
        $this->assertLessThan(
            $firstPayment,
            $firstOrder,
            'Order must be locked before Payment (saw: ' . implode(',', $seen) . ')',
        );
    }

    public function test_confirm_is_reconciliation_safe_when_called_twice(): void
    {
        config([
            'bml.webhook_secret' => 'test-secret',
            'bml.enforce_signature' => true,
            'bml.base_url' => 'https://api.merchants.bankofmaldives.com.mv/public',
        ]);

        $order = Order::create([
            'order_number' => 'LOCK-ORD-2',
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'payment_status' => 'unpaid',
            'subtotal' => 50,
            'total' => 50,
            'total_laar' => 5000,
        ]);

        $payment = Payment::create([
            'idempotency_key' => 'bml:init:lock-2',
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 50,
            'amount_laar' => 5000,
            'local_id' => 'BGLOCKORD2',
            'provider_transaction_id' => 'TXN-LOCK-2',
            'status' => 'initiated',
            'processed_at' => now(),
        ]);

        $payload = [
            'transactionId' => 'TXN-LOCK-2',
            'localId' => $payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => '50.00',
            'currency' => 'MVR',
        ];
        $raw = json_encode($payload, JSON_THROW_ON_ERROR);
        $sig = hash_hmac('sha256', $raw, 'test-secret');
        $headers = ['X-BML-Signature' => [$sig]];

        $service = app(PaymentService::class);
        $service->handleBmlWebhook($raw, $headers);
        $service->handleBmlWebhook($raw, $headers);

        $this->assertSame(1, Payment::where('order_id', $order->id)->where('status', 'confirmed')->count());
        $this->assertSame('confirmed', $payment->fresh()->status);
    }

    public function test_deadlock_exception_detector_recognizes_mysql_and_sqlite_signals(): void
    {
        $service = app(PaymentService::class);
        $method = new ReflectionMethod(PaymentService::class, 'isDeadlockException');
        $method->setAccessible(true);

        $mysql = new QueryException(
            'mysql',
            'update payments set status = ?',
            [],
            new \Exception('Deadlock found when trying to get lock; try restarting transaction', 1213),
        );
        // Populate errorInfo like PDO would.
        $ref = new \ReflectionObject($mysql);
        // QueryException stores previous; isDeadlockException reads errorInfo + message.
        $mysql->errorInfo = ['40001', 1213, 'Deadlock found when trying to get lock'];

        $this->assertTrue($method->invoke($service, $mysql));

        $sqlite = new QueryException(
            'sqlite',
            'update payments set status = ?',
            [],
            new \Exception('SQLSTATE[HY000]: General error: 5 database is locked'),
        );
        $sqlite->errorInfo = ['HY000', 5, 'database is locked'];
        $this->assertTrue($method->invoke($service, $sqlite));
    }
}
