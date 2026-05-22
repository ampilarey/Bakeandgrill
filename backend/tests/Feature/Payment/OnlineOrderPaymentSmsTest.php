<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Online pickup/delivery orders must SMS the customer with a tracking link
 * once BML payment is confirmed.
 */
class OnlineOrderPaymentSmsTest extends TestCase
{
    use RefreshDatabase;

    public function test_bml_webhook_sends_payment_confirmation_sms_for_online_pickup_order(): void
    {
        config([
            'bml.enforce_signature' => false,
            'bml.webhook_secret' => null,
            'app.url' => 'https://bakeandgrill.mv',
            'frontend.order_status_url' => '',
        ]);

        $customer = Customer::create([
            'name' => 'Online Customer',
            'phone' => '+9607991234',
        ]);

        $order = Order::create([
            'order_number' => 'ON-9001',
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'payment_status' => 'unpaid',
            'customer_id' => $customer->id,
            'subtotal' => 50.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 50.00,
            'total_laar' => 5000,
        ]);

        $transactionId = 'TXN-ONLINE-SMS-001';
        $payment = Payment::create([
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'amount' => 50.00,
            'amount_laar' => 5000,
            'status' => 'initiated',
            'idempotency_key' => 'bml:init:' . $order->id . ':test',
            'local_id' => 'LOCAL-ONLINE-SMS-001',
            'provider_transaction_id' => $transactionId,
        ]);

        $webhookBody = json_encode([
            'transactionId' => $transactionId,
            'localId' => $payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => '50.00',
            'currency' => 'MVR',
        ]);

        $response = $this->call(
            'POST',
            '/api/payments/bml/webhook',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json'],
            $webhookBody,
        );

        $response->assertOk();

        $order->refresh();
        $this->assertSame('pending', $order->status);
        $this->assertNotNull($order->paid_at);
        $this->assertSame('paid', $order->payment_status);

        $this->assertDatabaseHas('sms_logs', [
            'reference_type' => 'order',
            'reference_id' => (string) $order->id,
            'idempotency_key' => 'order:paid:confirm:' . $order->order_number,
        ]);

        $sms = SmsLog::query()
            ->where('idempotency_key', 'order:paid:confirm:' . $order->order_number)
            ->first();

        $this->assertNotNull($sms);
        $this->assertStringContainsString('Paid', (string) $sms->message);
        $this->assertStringContainsString('/order/track/', (string) $sms->message);
        $this->assertStringContainsString($order->tracking_token, (string) $sms->message);
    }

    public function test_stale_sms_idempotency_key_by_order_id_does_not_block_new_payment_sms(): void
    {
        config([
            'bml.enforce_signature' => false,
            'bml.webhook_secret' => null,
            'app.url' => 'https://bakeandgrill.mv',
        ]);

        $customer = Customer::create([
            'name' => 'Reuse ID Customer',
            'phone' => '+9607991234',
        ]);

        // Legacy row from before orders:purge — same numeric order id, different business order.
        SmsLog::create([
            'message' => 'Old payment SMS for a purged order',
            'to' => '+9607991234',
            'type' => 'transactional',
            'status' => 'sent',
            'encoding' => 'gsm7',
            'segments' => 1,
            'cost_estimate_mvr' => 0.25,
            'provider' => 'dhiraagu',
            'reference_type' => 'order',
            'reference_id' => '2',
            'idempotency_key' => 'order:paid:confirm:2',
            'sent_at' => now()->subMonths(2),
        ]);

        $order = Order::create([
            'order_number' => 'BG-20260522-0099',
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'payment_status' => 'unpaid',
            'customer_id' => $customer->id,
            'subtotal' => 50.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 50.00,
            'total_laar' => 5000,
        ]);

        // Force id reuse to simulate post-purge auto-increment reset.
        \Illuminate\Support\Facades\DB::table('orders')
            ->where('id', $order->id)
            ->update(['id' => 2]);
        $order = Order::findOrFail(2);

        $transactionId = 'TXN-STALE-IDEM-001';
        $payment = Payment::create([
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'amount' => 50.00,
            'amount_laar' => 5000,
            'status' => 'initiated',
            'idempotency_key' => 'bml:init:' . $order->id . ':stale',
            'local_id' => 'LOCAL-STALE-IDEM-001',
            'provider_transaction_id' => $transactionId,
        ]);

        $webhookBody = json_encode([
            'transactionId' => $transactionId,
            'localId' => $payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => '50.00',
            'currency' => 'MVR',
        ]);

        $this->call(
            'POST',
            '/api/payments/bml/webhook',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json'],
            $webhookBody,
        )->assertOk();

        $this->assertDatabaseHas('sms_logs', [
            'idempotency_key' => 'order:paid:confirm:' . $order->order_number,
            'reference_id' => '2',
        ]);

        $sms = SmsLog::query()
            ->where('idempotency_key', 'order:paid:confirm:' . $order->order_number)
            ->first();

        $this->assertNotNull($sms);
        $this->assertContains($sms->status, ['sent', 'demo']);
        $this->assertStringContainsString('BG-20260522-0099', (string) $sms->message);
    }
}
