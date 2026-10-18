<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Payments\Services\PaymentService;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\TestCase;

/**
 * Audit #1 — order-level in-flight online payment reservation (any gateway/amount).
 */
class BmlActiveSessionGuardTest extends TestCase
{
    use RefreshDatabase;

    private function makeBmlGuardOrder(int $totalLaar = 10000): Order
    {
        return Order::create([
            'order_number' => 'BML-GUARD-' . uniqid(),
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'subtotal' => $totalLaar / 100,
            'total' => $totalLaar / 100,
            'total_laar' => $totalLaar,
        ]);
    }

    private function mockBmlGateway(int $expectedCalls = 1): void
    {
        $mock = Mockery::mock(BmlConnectService::class);
        $mock->shouldReceive('normalizeLocalId')->andReturnUsing(
            fn (string $id) => substr(preg_replace('/[^A-Za-z0-9]/', '', $id) ?? $id, 0, 50),
        );
        $mock->shouldReceive('createPayment')
            ->times($expectedCalls)
            ->andReturnUsing(function (int $amount, string $localId) {
                static $n = 0;
                $n++;

                return [
                    'transaction_id' => 'TXN-GUARD-' . $n,
                    'payment_url' => 'https://bml.example/pay/TXN-GUARD-' . $n,
                    'local_id' => $localId,
                ];
            });
        $this->app->instance(BmlConnectService::class, $mock);
    }

    public function test_two_different_idempotency_keys_reuse_same_active_session(): void
    {
        $order = $this->makeBmlGuardOrder();
        $this->mockBmlGateway(1);

        $a = app(PaymentService::class)->initiateBmlPayment($order, 10000, 'key-alpha');
        $b = app(PaymentService::class)->initiateBmlPayment($order, 10000, 'key-beta');

        $this->assertFalse($a['reused']);
        $this->assertTrue($b['reused']);
        $this->assertSame($a['payment_id'], $b['payment_id']);
        $this->assertSame($a['local_id'], $b['local_id']);
        $this->assertNotEmpty($b['payment_url']);
        $this->assertSame(1, Payment::where('order_id', $order->id)->where('gateway', 'bml')->count());
    }

    public function test_double_click_style_retry_reuses_session(): void
    {
        $order = $this->makeBmlGuardOrder();
        $this->mockBmlGateway(1);

        $first = app(PaymentService::class)->initiateBmlPayment($order, 10000, 'paypage:' . $order->id . ':10000');
        $second = app(PaymentService::class)->initiateBmlPayment($order, 10000, 'paypage:' . $order->id . ':10000');

        $this->assertTrue($second['reused']);
        $this->assertSame($first['payment_id'], $second['payment_id']);
    }

    public function test_failed_attempt_allows_valid_retry(): void
    {
        $order = $this->makeBmlGuardOrder();
        Payment::create([
            'idempotency_key' => 'bml:failed:' . $order->id,
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 100,
            'amount_laar' => 10000,
            'local_id' => 'BGFAILED1',
            'status' => 'failed',
            'processed_at' => now(),
        ]);

        $this->mockBmlGateway(1);
        $result = app(PaymentService::class)->initiateBmlPayment($order, 10000, 'retry-after-fail');

        $this->assertFalse($result['reused']);
        $this->assertSame(2, Payment::where('order_id', $order->id)->where('gateway', 'bml')->count());
        $this->assertSame('initiated', Payment::find($result['payment_id'])->status);
    }

    public function test_partial_payment_allows_separate_session_for_remaining_balance(): void
    {
        $order = $this->makeBmlGuardOrder(10000);
        Payment::create([
            'idempotency_key' => 'partial-paid',
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 40,
            'amount_laar' => 4000,
            'local_id' => 'BGPARTIALPAID',
            'status' => 'confirmed',
            'processed_at' => now(),
        ]);
        $order->update(['payment_status' => 'partial']);

        $this->mockBmlGateway(1);
        $result = app(PaymentService::class)->initiateBmlPayment($order, 6000, 'partial:remaining');

        $this->assertFalse($result['reused']);
        $this->assertSame(6000, (int) Payment::find($result['payment_id'])->amount_laar);

        // Second call for same remaining amount reuses.
        $again = app(PaymentService::class)->initiateBmlPayment($order, 6000, 'partial:remaining:other-key');
        $this->assertTrue($again['reused']);
        $this->assertSame($result['payment_id'], $again['payment_id']);
    }

    public function test_pending_partial_blocks_full_balance_bml_session(): void
    {
        $order = $this->makeBmlGuardOrder(10000);
        $this->mockBmlGateway(1);

        app(PaymentService::class)->initiateBmlPayment($order, 5000, 'partial-50');

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        app(PaymentService::class)->initiateBmlPayment($order, 10000, 'full-100');
    }

    public function test_pending_bml_blocks_stripe_intent_reservation(): void
    {
        $order = $this->makeBmlGuardOrder(10000);
        $this->mockBmlGateway(1);
        app(PaymentService::class)->initiateBmlPayment($order, 5000, 'partial-50');

        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);

        DB::transaction(function () use ($order) {
            Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            app(PaymentService::class)->resolveOnlinePaymentReservation($order, 'stripe', 10000);
        });
    }

    /**
     * Owner, 2026-10-18: Pay on a sent invoice opened BML's {"message":"Forbidden"}. The
     * second tap built "{api host}/pay/{id}"; it must hand back the link BML gave.
     */
    public function test_a_reused_session_opens_the_page_bml_gave_never_the_api_host(): void
    {
        config(['bml.base_url' => 'https://api.merchants.bankofmaldives.com.mv/public']);
        $order = $this->makeBmlGuardOrder();
        $this->mockBmlGateway(1);

        $first = app(PaymentService::class)->initiateBmlPayment($order, 10000, 'invoice-tap-1');
        $second = app(PaymentService::class)->initiateBmlPayment($order, 10000, 'invoice-tap-2');

        $this->assertTrue($second['reused']);
        $this->assertSame($first['payment_url'], $second['payment_url']);
        $this->assertStringNotContainsString('api.merchants', (string) $second['payment_url']);
    }

    public function test_a_session_started_before_links_were_kept_asks_bml_for_its_page(): void
    {
        $order = $this->makeBmlGuardOrder();
        Payment::create([
            'idempotency_key' => 'bml:old:' . $order->id,
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 100,
            'amount_laar' => 10000,
            'local_id' => 'BGOLD1',
            'status' => 'initiated',
            'provider_transaction_id' => 'TXN-OLD',
            'processed_at' => now(),
        ]);
        $mock = Mockery::mock(BmlConnectService::class);
        $mock->shouldReceive('normalizeLocalId')->andReturnUsing(fn (string $id) => preg_replace('/[^A-Za-z0-9]/', '', $id));
        $mock->shouldReceive('getTransactionStatus')->with('TXN-OLD')->andReturn(['state' => 'QR_CODE_GENERATED', 'url' => 'https://pay.example/TXN-OLD']);
        $mock->shouldNotReceive('createPayment');
        $this->app->instance(BmlConnectService::class, $mock);

        $res = app(PaymentService::class)->initiateBmlPayment($order, 10000, 'invoice-tap');

        $this->assertSame('https://pay.example/TXN-OLD', $res['payment_url']);
        $this->assertSame('https://pay.example/TXN-OLD', Payment::query()->where('provider_transaction_id', 'TXN-OLD')->value('gateway_response')['payment_url'] ?? null);
    }

    public function test_a_session_whose_page_is_lost_is_closed_and_a_new_one_started(): void
    {
        $order = $this->makeBmlGuardOrder();
        Payment::create([
            'idempotency_key' => 'bml:lost:' . $order->id,
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 100,
            'amount_laar' => 10000,
            'local_id' => 'BGLOST1',
            'status' => 'initiated',
            'provider_transaction_id' => 'TXN-LOST',
            'processed_at' => now(),
        ]);
        $mock = Mockery::mock(BmlConnectService::class);
        $mock->shouldReceive('normalizeLocalId')->andReturnUsing(fn (string $id) => preg_replace('/[^A-Za-z0-9]/', '', $id));
        $mock->shouldReceive('getTransactionStatus')->andReturn(['state' => 'QR_CODE_GENERATED']);
        $mock->shouldReceive('createPayment')->once()->andReturn(['transaction_id' => 'TXN-NEW', 'payment_url' => 'https://pay.example/TXN-NEW', 'local_id' => 'x']);
        $this->app->instance(BmlConnectService::class, $mock);

        $res = app(PaymentService::class)->initiateBmlPayment($order, 10000, 'invoice-tap');

        $this->assertSame('https://pay.example/TXN-NEW', $res['payment_url']);
        $this->assertSame('cancelled', Payment::query()->where('provider_transaction_id', 'TXN-LOST')->value('status'));
    }
}
