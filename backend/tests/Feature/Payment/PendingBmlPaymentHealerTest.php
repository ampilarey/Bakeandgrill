<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Payments\Gateway\BmlConnectService;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Receipt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\TestCase;

/**
 * Owner, 2026-10-05: a bill sent from the POS and paid online by the
 * customer — "payment processed but customer sees pending payment and pos
 * also shows unpaid". When neither the webhook nor the return URL settled
 * the payment, every page the customer can land on, and a scheduled sweep,
 * now ask the bank themselves.
 */
class PendingBmlPaymentHealerTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;

    private Receipt $receipt;

    private Payment $payment;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();

        $customer = Customer::create(['name' => 'Pay Link Customer', 'phone' => '+9607442009', 'is_active' => true]);
        $this->order = Order::create([
            'order_number' => 'POS-HEAL-001',
            'type' => 'takeaway',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'customer_id' => $customer->id,
            'subtotal' => 85.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 85.00,
            'total_laar' => 8500,
        ]);
        $this->receipt = Receipt::ensureForOrder($this->order);
        $this->payment = Payment::create([
            'order_id' => $this->order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'amount' => 85.00,
            'amount_laar' => 8500,
            'status' => 'initiated',
            'idempotency_key' => 'partial:paypage:' . $this->order->id . ':8500',
            'local_id' => 'BGPOSHEAL001',
            'provider_transaction_id' => 'TXN-HEAL-001',
        ]);
    }

    private function bankSays(string $state, int $times = 1): void
    {
        $mock = Mockery::mock(BmlConnectService::class);
        $expect = $mock->shouldReceive('getTransactionStatus')->with('TXN-HEAL-001')->times($times);
        if ($state === 'DOWN') {
            $expect->andThrow(new \RuntimeException('timeout'));
        } else {
            $expect->andReturn(['state' => $state, 'transactionId' => 'TXN-HEAL-001', 'amount' => 8500]);
        }
        $this->app->instance(BmlConnectService::class, $mock);
    }

    private function assertOrderPaid(): void
    {
        $order = $this->order->fresh();
        $this->assertSame('paid', $order->payment_status);
        $this->assertNotNull($order->paid_at);
        $this->assertSame('confirmed', (string) $this->payment->fresh()->status);
    }

    public function test_return_url_without_a_state_still_settles_when_the_bank_says_confirmed(): void
    {
        $this->bankSays('CONFIRMED');

        // The bank brought the customer back with none of the query the
        // verified path needs; the old code showed "not completed".
        $this->get(route('bml.return', ['orderId' => $this->order->id, 'receiptToken' => $this->receipt->token]))
            ->assertRedirect(route('receipts.show', $this->receipt->token))
            ->assertSessionHas('success', 'Payment received — thank you!');

        $this->assertOrderPaid();
    }

    public function test_receipt_page_asks_the_bank_and_shows_paid_once_per_minute(): void
    {
        $this->bankSays('CONFIRMED', 1);

        $this->get('/receipts/' . $this->receipt->token)->assertOk()
            ->assertSee('Payment confirmed')
            ->assertDontSee('Payment pending');
        $this->assertOrderPaid();

        // Paid now: the second load has nothing to ask.
        $this->get('/receipts/' . $this->receipt->token)->assertOk()->assertSee('Payment confirmed');
    }

    public function test_a_refresh_within_a_minute_does_not_ask_the_bank_again(): void
    {
        $this->bankSays('PENDING', 1);

        $this->get('/receipts/' . $this->receipt->token)->assertOk()->assertSee('Payment pending');
        $this->get('/receipts/' . $this->receipt->token)->assertOk()->assertSee('Payment pending');
        $this->assertSame('unpaid', $this->order->fresh()->payment_status);
    }

    public function test_pay_page_sends_a_customer_who_already_paid_to_the_receipt(): void
    {
        $this->bankSays('CONFIRMED');

        $this->get('/pay/' . $this->receipt->token)
            ->assertRedirect(route('receipts.show', $this->receipt->token))
            ->assertSessionHas('success', 'This order is already paid.');
        $this->assertOrderPaid();
    }

    public function test_invoice_page_settles_the_order_and_marks_the_invoice_paid(): void
    {
        $invoice = Invoice::create([
            'invoice_number' => 'INV-HEAL-001', 'type' => 'sale', 'status' => 'sent',
            'order_id' => $this->order->id, 'customer_id' => $this->order->customer_id,
            'subtotal_laar' => 8500, 'tax_laar' => 0, 'discount_laar' => 0, 'total_laar' => 8500,
            'amount_paid_laar' => 0, 'credited_laar' => 0, 'written_off_laar' => 0,
            'subtotal' => 85, 'tax_amount' => 0, 'discount_amount' => 0, 'total' => 85,
            'issue_date' => now()->toDateString(), 'notes' => 'Bill from the POS.',
        ]);
        $this->bankSays('CONFIRMED');

        $this->get('/invoices/' . $invoice->token)->assertOk()->assertDontSee('Pay this invoice');
        $this->assertOrderPaid();
        $this->assertSame('paid', (string) $invoice->fresh()->status);
    }

    public function test_a_held_ticket_paid_online_comes_off_hold_and_is_paid(): void
    {
        // The owner's case: the POS put the ticket on hold, sent the bill, the
        // customer paid by card. held → paid is not a legal move, so the
        // confirmation used to roll back every time.
        $this->order->update(['status' => 'held', 'held_at' => now()]);
        $this->bankSays('CONFIRMED');

        $this->get('/receipts/' . $this->receipt->token)->assertOk()->assertSee('Payment confirmed');

        $this->assertOrderPaid();
        $order = $this->order->fresh();
        $this->assertSame('paid', $order->status);
        $this->assertNull($order->held_at);
    }

    public function test_an_order_out_for_delivery_keeps_its_stage_and_is_marked_paid(): void
    {
        // pending → out_for_delivery is not a legal move either, so walk the
        // order there the way dispatch does.
        $this->order->update(['type' => 'delivery']);
        $this->order->update(['status' => 'ready']);
        $this->order->update(['status' => 'out_for_delivery']);
        $this->assertSame('out_for_delivery', $this->order->fresh()->status);
        $this->bankSays('CONFIRMED');

        $this->get('/receipts/' . $this->receipt->token)->assertOk();

        $this->assertOrderPaid();
        $this->assertSame('out_for_delivery', $this->order->fresh()->status);
    }

    public function test_a_bank_outage_leaves_the_page_pending_without_an_error(): void
    {
        $this->bankSays('DOWN');

        $this->get('/receipts/' . $this->receipt->token)->assertOk()->assertSee('Payment pending');
        $this->assertSame('unpaid', $this->order->fresh()->payment_status);
        $this->assertSame('initiated', (string) $this->payment->fresh()->status);
    }

    public function test_the_scheduled_sweep_settles_payments_the_webhook_missed(): void
    {
        // Too fresh: the webhook may still be on its way.
        $this->artisan('payments:reconcile-pending-bml')->expectsOutput('Checked 0 order(s), settled 0.')->assertSuccessful();

        Payment::whereKey($this->payment->id)->update(['created_at' => now()->subMinutes(5)]);
        $this->bankSays('CONFIRMED');

        $this->artisan('payments:reconcile-pending-bml')->expectsOutput('Checked 1 order(s), settled 1.')->assertSuccessful();
        $this->assertOrderPaid();

        // Nothing pending any more.
        $this->artisan('payments:reconcile-pending-bml')->expectsOutput('Checked 0 order(s), settled 0.')->assertSuccessful();
    }
}
