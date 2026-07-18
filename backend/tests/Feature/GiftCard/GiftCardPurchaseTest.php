<?php

declare(strict_types=1);

namespace Tests\Feature\GiftCard;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Payments\Listeners\IssuePurchasedGiftCardOnOrderPaidListener;
use App\Domains\Payments\Services\GiftCardPurchaseDeliveryWindow;
use App\Domains\Payments\Services\GiftCardPurchaseFulfillmentService;
use App\Domains\Payments\Services\PaymentService;
use App\Mail\GiftCardMail;
use App\Models\GiftCardPurchase;
use App\Models\Order;
use App\Models\Payment;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class GiftCardPurchaseTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_start_gift_card_purchase(): void
    {
        $this->mock(PaymentService::class, function ($mock): void {
            $mock->shouldReceive('initiateBmlPayment')->once()->andReturn([
                'payment_url' => 'https://pay.example/test',
                'payment_id' => 99,
                'local_id' => 'GC-TEST',
                'reused' => false,
            ]);
        });

        $customer = $this->makeCustomer([
            'phone' => '+9607777009',
            'email' => 'buyer@example.com',
        ]);

        $this->postJson('/api/gift-cards/purchase', [
            'amount' => 200,
            'recipient_phone' => '+9607777009',
            'recipient_email' => 'friend@example.com',
            'personal_note' => 'Enjoy!',
            'sender_name' => 'Aisha',
            'send_anonymously' => false,
        ], $this->customerHeaders($customer))
            ->assertCreated()
            ->assertJsonPath('payment_url', 'https://pay.example/test')
            ->assertJsonPath('amount', 200);

        $this->assertDatabaseHas('orders', [
            'customer_id' => $customer->id,
            'type' => 'gift_card',
            'status' => 'payment_pending',
            'total' => 200,
        ]);

        $this->assertDatabaseHas('gift_card_purchases', [
            'purchaser_customer_id' => $customer->id,
            'amount' => 200,
            'recipient_phone' => '+9607777009',
            'recipient_email' => 'friend@example.com',
            'sender_name' => 'Aisha',
            'send_anonymously' => 0,
        ]);
    }

    public function test_purchase_can_be_anonymous(): void
    {
        $this->mock(PaymentService::class, function ($mock): void {
            $mock->shouldReceive('initiateBmlPayment')->once()->andReturn([
                'payment_url' => 'https://pay.example/anon',
                'payment_id' => 100,
                'local_id' => 'GC-ANON',
                'reused' => false,
            ]);
        });

        $customer = $this->makeCustomer(['phone' => '+9607777020']);

        $this->postJson('/api/gift-cards/purchase', [
            'amount' => 100,
            'recipient_phone' => '+9607777021',
            'send_anonymously' => true,
        ], $this->customerHeaders($customer))
            ->assertCreated();

        $this->assertDatabaseHas('gift_card_purchases', [
            'purchaser_customer_id' => $customer->id,
            'recipient_phone' => '+9607777021',
            'send_anonymously' => 1,
            'sender_name' => null,
        ]);
    }

    public function test_purchase_requires_sender_name_unless_anonymous(): void
    {
        $this->mock(PaymentService::class, function ($mock): void {
            $mock->shouldReceive('initiateBmlPayment')->never();
        });

        $customer = $this->makeCustomer(['phone' => '+9607777022']);

        $this->postJson('/api/gift-cards/purchase', [
            'amount' => 100,
            'recipient_phone' => '+9607777023',
            'send_anonymously' => false,
        ], $this->customerHeaders($customer))
            ->assertStatus(422);
    }

    public function test_purchase_requires_delivery_channel(): void
    {
        $this->mock(PaymentService::class, function ($mock): void {
            $mock->shouldReceive('initiateBmlPayment')->never();
        });

        $customer = $this->makeCustomer();
        $customer->forceFill(['phone' => '', 'email' => null])->save();

        $this->postJson('/api/gift-cards/purchase', [
            'amount' => 100,
            'sender_name' => 'Buyer',
        ], $this->customerHeaders($customer))
            ->assertStatus(422);
    }

    public function test_purchase_rejects_amount_below_minimum(): void
    {
        $this->mock(PaymentService::class, function ($mock): void {
            $mock->shouldReceive('initiateBmlPayment')->never();
        });

        $customer = $this->makeCustomer(['phone' => '+9607777012']);

        $this->postJson('/api/gift-cards/purchase', [
            'amount' => 10,
            'recipient_phone' => '+9607777012',
            'sender_name' => 'Buyer',
        ], $this->customerHeaders($customer))
            ->assertStatus(422);
    }

    public function test_order_paid_issues_and_delivers_purchased_gift_card(): void
    {
        Mail::fake();

        $customer = $this->makeCustomer([
            'phone' => '+9607777010',
            'email' => 'giftbuyer@example.com',
        ]);

        $order = Order::create([
            'order_number' => 'GC-TEST-0001',
            'tracking_token' => 'gctest1',
            'type' => 'gift_card',
            'status' => 'paid',
            'payment_status' => 'paid',
            'customer_id' => $customer->id,
            'subtotal' => 150,
            'subtotal_laar' => 15000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'discount_amount' => 0,
            'total' => 150,
            'total_laar' => 15000,
            'paid_at' => now(),
        ]);

        GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => 150,
            'recipient_phone' => '+9607777010',
            'recipient_email' => 'giftbuyer@example.com',
            'personal_note' => 'Thanks!',
        ]);

        app(IssuePurchasedGiftCardOnOrderPaidListener::class)->handle(
            new OrderPaid(OrderPaidData::fromOrder($order, true)),
        );

        $purchase = GiftCardPurchase::query()->where('order_id', $order->id)->first();
        $this->assertNotNull($purchase?->gift_card_id);

        $this->assertDatabaseHas('sms_logs', [
            'reference_type' => 'gift_card',
            'to' => '+9607777010',
        ]);

        Mail::assertSent(GiftCardMail::class, fn (GiftCardMail $mail) => $mail->hasTo('giftbuyer@example.com'));

        $this->assertTrue($purchase->fresh()->sms_ok);
        $this->assertTrue($purchase->fresh()->email_ok);
        $this->assertSame('completed', $order->fresh()->status);

        // Idempotent
        app(IssuePurchasedGiftCardOnOrderPaidListener::class)->handle(
            new OrderPaid(OrderPaidData::fromOrder($order->fresh(), true)),
        );
        $this->assertSame(1, SmsLog::query()->where('reference_type', 'gift_card')->count());
    }

    public function test_purchase_status_recovers_undelivered_by_reissuing(): void
    {
        Mail::fake();
        $customer = $this->makeCustomer([
            'phone' => '+9607777017',
            'email' => 'recover@example.com',
        ]);

        $order = Order::create([
            'order_number' => 'GC-TEST-RECOVER',
            'tracking_token' => 'gcrecover',
            'type' => 'gift_card',
            'status' => 'completed',
            'payment_status' => 'paid',
            'customer_id' => $customer->id,
            'subtotal' => 50,
            'subtotal_laar' => 5000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 50,
            'total_laar' => 5000,
            'paid_at' => now(),
            'completed_at' => now(),
        ]);

        $oldCard = \App\Models\GiftCard::create([
            'code_hash' => hash('sha256', 'OLDCODE'),
            'code_last4' => 'OLD1',
            'initial_balance' => 50,
            'current_balance' => 50,
            'status' => 'active',
            'purchased_by_customer_id' => $customer->id,
            'issued_to_customer_id' => $customer->id,
        ]);

        GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => 50,
            'recipient_phone' => '+9607777017',
            'recipient_email' => 'recover@example.com',
            'gift_card_id' => $oldCard->id,
            'sms_ok' => false,
            'email_ok' => false,
            'delivery_recovery_count' => 0,
        ]);

        // No plaintext in cache/DB — status poll should reissue once and deliver.
        $this->getJson("/api/gift-cards/purchases/{$order->id}", $this->customerHeaders($customer))
            ->assertOk()
            ->assertJsonPath('issued', true);

        $purchase = GiftCardPurchase::where('order_id', $order->id)->first();
        $this->assertNotNull($purchase);
        $this->assertNotSame($oldCard->id, $purchase->gift_card_id);
        $this->assertSame(1, (int) $purchase->delivery_recovery_count);
        $this->assertSame('cancelled', $oldCard->fresh()->status);
        $this->assertTrue($purchase->sms_ok === true || $purchase->email_ok === true);
        Mail::assertSent(GiftCardMail::class);
    }

    public function test_fulfillment_keeps_card_when_delivery_column_missing(): void
    {
        Mail::fake();
        $customer = $this->makeCustomer([
            'phone' => '+9607777016',
            'email' => 'colmiss@example.com',
        ]);

        $order = Order::create([
            'order_number' => 'GC-TEST-COL',
            'tracking_token' => 'gccol',
            'type' => 'gift_card',
            'status' => 'paid',
            'payment_status' => 'paid',
            'customer_id' => $customer->id,
            'subtotal' => 100,
            'subtotal_laar' => 10000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 100,
            'total_laar' => 10000,
            'paid_at' => now(),
        ]);

        GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => 100,
            'recipient_phone' => '+9607777016',
            'recipient_email' => 'colmiss@example.com',
        ]);

        Schema::table('gift_card_purchases', function ($table): void {
            $table->dropColumn('code_delivery_expires_at');
        });

        app(GiftCardPurchaseFulfillmentService::class)->fulfill($order->fresh());

        $this->assertNotNull(GiftCardPurchase::where('order_id', $order->id)->value('gift_card_id'));
        $this->assertSame('completed', $order->fresh()->status);
        Mail::assertSent(GiftCardMail::class);
    }

    public function test_purchase_status_retries_issue_when_paid_but_not_issued(): void
    {
        Mail::fake();
        $customer = $this->makeCustomer([
            'phone' => '+9607777014',
            'email' => 'retry@example.com',
        ]);

        $order = Order::create([
            'order_number' => 'GC-TEST-RETRY',
            'tracking_token' => 'gcretry',
            'type' => 'gift_card',
            'status' => 'paid',
            'payment_status' => 'paid',
            'customer_id' => $customer->id,
            'subtotal' => 100,
            'subtotal_laar' => 10000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 100,
            'total_laar' => 10000,
            'paid_at' => now(),
        ]);

        GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => 100,
            'recipient_phone' => '+9607777014',
            'recipient_email' => 'retry@example.com',
        ]);

        $this->getJson("/api/gift-cards/purchases/{$order->id}", $this->customerHeaders($customer))
            ->assertOk()
            ->assertJsonPath('issued', true)
            ->assertJsonPath('gift_card.status', 'active');

        $this->assertDatabaseHas('gift_card_purchases', [
            'order_id' => $order->id,
        ]);
        $this->assertNotNull(GiftCardPurchase::where('order_id', $order->id)->value('gift_card_id'));
        Mail::assertSent(GiftCardMail::class);
    }

    public function test_purchase_status_reconciles_confirmed_bml_then_issues(): void
    {
        Mail::fake();
        config([
            'bml.base_url' => 'https://api.bml.test/public',
            'bml.app_id' => 'app',
            'bml.api_key' => 'key',
        ]);
        Http::fake([
            'https://api.bml.test/public/v2/transactions/TXN-GC-REC-1' => Http::response([
                'transactionId' => 'TXN-GC-REC-1',
                'state' => 'CONFIRMED',
                'amount' => '10000',
                'currency' => 'MVR',
            ], 200),
        ]);

        $customer = $this->makeCustomer([
            'phone' => '+9607777015',
            'email' => 'reconcile@example.com',
        ]);

        $order = Order::create([
            'order_number' => 'GC-TEST-RECONCILE',
            'tracking_token' => 'gcrecon',
            'type' => 'gift_card',
            'status' => 'payment_pending',
            'payment_status' => 'unpaid',
            'customer_id' => $customer->id,
            'subtotal' => 100,
            'subtotal_laar' => 10000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 100,
            'total_laar' => 10000,
        ]);

        GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => 100,
            'recipient_phone' => '+9607777015',
            'recipient_email' => 'reconcile@example.com',
        ]);

        Payment::create([
            'order_id' => $order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'amount' => 100,
            'amount_laar' => 10000,
            'status' => 'initiated',
            'local_id' => 'GCTESTRECONCILE',
            'provider_transaction_id' => 'TXN-GC-REC-1',
            'idempotency_key' => 'bml:gc:reconcile:test',
        ]);

        $this->getJson("/api/gift-cards/purchases/{$order->id}", $this->customerHeaders($customer))
            ->assertOk()
            ->assertJsonPath('issued', true)
            ->assertJsonPath('payment_status', 'paid');

        $this->assertNotNull(GiftCardPurchase::where('order_id', $order->id)->value('gift_card_id'));
        $this->assertSame('confirmed', Payment::where('order_id', $order->id)->value('status'));
        Mail::assertSent(GiftCardMail::class);
    }

    public function test_public_view_token_shows_code(): void
    {
        $customer = $this->makeCustomer([
            'phone' => '+9607777019',
            'email' => 'view@example.com',
        ]);

        $order = Order::create([
            'order_number' => 'GC-TEST-VIEW',
            'tracking_token' => 'gcview',
            'type' => 'gift_card',
            'status' => 'completed',
            'payment_status' => 'paid',
            'customer_id' => $customer->id,
            'subtotal' => 50,
            'subtotal_laar' => 5000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 50,
            'total_laar' => 5000,
            'paid_at' => now(),
            'completed_at' => now(),
        ]);

        $card = \App\Models\GiftCard::create([
            'code_hash' => hash('sha256', 'VIEWCODE1234'),
            'code_last4' => 'VIEW',
            'initial_balance' => 50,
            'current_balance' => 50,
            'status' => 'active',
            'purchased_by_customer_id' => $customer->id,
            'issued_to_customer_id' => $customer->id,
        ]);

        $purchase = GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => 50,
            'recipient_phone' => '+9607777019',
            'gift_card_id' => $card->id,
        ]);

        app(GiftCardPurchaseDeliveryWindow::class)->store($purchase, 'VIEW-CODE-TEST-0001');
        $token = $purchase->fresh()->view_token;
        $this->assertNotEmpty($token);

        $this->getJson("/api/gift-cards/view/{$token}")
            ->assertOk()
            ->assertJsonPath('code', 'VIEW-CODE-TEST-0001')
            ->assertJsonPath('order_number', 'GC-TEST-VIEW');

        $msg = app(\App\Domains\Payments\Services\GiftCardSmsDelivery::class)->buildMessage(
            $card,
            'VIEW-CODE-TEST-0001',
            null,
            app(GiftCardPurchaseDeliveryWindow::class)->viewUrl($purchase->fresh()),
        );
        $this->assertStringContainsString('View your card:', $msg);
        $this->assertStringContainsString('/order/gift-cards/v/', $msg);
    }

    public function test_purchase_status_never_reveals_code_even_when_delivery_failed(): void
    {
        Mail::fake();
        $customer = $this->makeCustomer([
            'phone' => '+9607777018',
            'email' => 'reveal@example.com',
        ]);

        $order = Order::create([
            'order_number' => 'GC-TEST-REVEAL',
            'tracking_token' => 'gcreveal',
            'type' => 'gift_card',
            'status' => 'completed',
            'payment_status' => 'paid',
            'customer_id' => $customer->id,
            'subtotal' => 50,
            'subtotal_laar' => 5000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 50,
            'total_laar' => 5000,
            'paid_at' => now(),
            'completed_at' => now(),
        ]);

        $card = \App\Models\GiftCard::create([
            'code_hash' => hash('sha256', 'REVEALCODE1234'),
            'code_last4' => '1234',
            'initial_balance' => 50,
            'current_balance' => 50,
            'status' => 'active',
            'purchased_by_customer_id' => $customer->id,
            'issued_to_customer_id' => $customer->id,
        ]);

        $purchase = GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => 50,
            'recipient_phone' => '+9607777018',
            'recipient_email' => 'reveal@example.com',
            'sender_name' => 'Aisha',
            'gift_card_id' => $card->id,
            'sms_ok' => false,
            'email_ok' => false,
            'delivery_recovery_count' => 1,
        ]);

        app(GiftCardPurchaseDeliveryWindow::class)->store($purchase, 'ABCD-EFGH-IJKL-MNOP');

        $this->getJson("/api/gift-cards/purchases/{$order->id}", $this->customerHeaders($customer))
            ->assertOk()
            ->assertJsonPath('issued', true)
            ->assertJsonPath('code', null)
            ->assertJsonPath('sender_name', 'Aisha')
            ->assertJsonPath('delivery.can_resend', true);
    }

    public function test_sms_includes_sender_from_line(): void
    {
        $card = \App\Models\GiftCard::create([
            'code_hash' => hash('sha256', 'FROMCODE1234567'),
            'code_last4' => '4567',
            'initial_balance' => 100,
            'current_balance' => 100,
            'status' => 'active',
        ]);

        $msg = app(\App\Domains\Payments\Services\GiftCardSmsDelivery::class)->buildMessage(
            $card,
            'FROMCODE1234567',
            'Have fun!',
            null,
            'From: Aisha',
        );

        $this->assertStringContainsString('From: Aisha', $msg);
        $this->assertStringContainsString('Code: FROMCODE1234567', $msg);
        $this->assertStringContainsString('Have fun!', $msg);
    }

    public function test_purchase_status_never_exposes_plaintext_code(): void
    {
        Mail::fake();
        $customer = $this->makeCustomer([
            'phone' => '+9607777011',
            'email' => 'status@example.com',
        ]);

        $order = Order::create([
            'order_number' => 'GC-TEST-0002',
            'tracking_token' => 'gctest2',
            'type' => 'gift_card',
            'status' => 'paid',
            'customer_id' => $customer->id,
            'subtotal' => 100,
            'subtotal_laar' => 10000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 100,
            'total_laar' => 10000,
        ]);

        GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => 100,
            'recipient_phone' => '+9607777011',
            'recipient_email' => 'status@example.com',
        ]);

        app(IssuePurchasedGiftCardOnOrderPaidListener::class)->handle(
            new OrderPaid(OrderPaidData::fromOrder($order, true)),
        );

        $res = $this->getJson("/api/gift-cards/purchases/{$order->id}", $this->customerHeaders($customer))
            ->assertOk()
            ->assertJsonPath('issued', true);

        $this->assertArrayHasKey('masked_code', $res->json('gift_card'));
        $this->assertArrayNotHasKey('code', $res->json('gift_card'));
        $this->assertNull($res->json('code'));
        $this->assertTrue($res->json('delivery.sms_ok'));
        $this->assertTrue($res->json('delivery.email_ok'));
        $this->assertTrue($res->json('delivery.can_resend'));
    }

    public function test_customer_can_resend_purchase_delivery(): void
    {
        Mail::fake();
        $customer = $this->makeCustomer([
            'phone' => '+9607777013',
            'email' => 'resend@example.com',
        ]);

        // Simulate PDO string IDs (strict_types TypeError was crashing resend on TEST).
        $this->assertIsInt($customer->id);

        $order = Order::create([
            'order_number' => 'GC-TEST-0003',
            'tracking_token' => 'gctest3',
            'type' => 'gift_card',
            'status' => 'paid',
            'customer_id' => $customer->id,
            'subtotal' => 100,
            'subtotal_laar' => 10000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 100,
            'total_laar' => 10000,
        ]);

        GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => 100,
            'recipient_phone' => '+9607777013',
            'recipient_email' => 'resend@example.com',
        ]);

        app(IssuePurchasedGiftCardOnOrderPaidListener::class)->handle(
            new OrderPaid(OrderPaidData::fromOrder($order, true)),
        );

        $smsBefore = SmsLog::query()->where('reference_type', 'gift_card')->count();

        $res = $this->postJson(
            "/api/gift-cards/purchases/{$order->id}/resend",
            ['channel' => 'sms'],
            $this->customerHeaders($customer),
        )->assertOk();

        $this->assertNull($res->json('code'));
        $this->assertSame(1, $res->json('delivery.resend_count'));
        $this->assertGreaterThan($smsBefore, SmsLog::query()->where('reference_type', 'gift_card')->count());
    }

    public function test_resend_fails_when_delivery_window_expired(): void
    {
        Mail::fake();
        $customer = $this->makeCustomer([
            'phone' => '+9607777014',
            'email' => 'expired@example.com',
        ]);

        $order = Order::create([
            'order_number' => 'GC-TEST-0004',
            'tracking_token' => 'gctest4',
            'type' => 'gift_card',
            'status' => 'paid',
            'customer_id' => $customer->id,
            'subtotal' => 100,
            'subtotal_laar' => 10000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 100,
            'total_laar' => 10000,
        ]);

        $purchase = GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => 100,
            'recipient_phone' => '+9607777014',
            'recipient_email' => 'expired@example.com',
        ]);

        app(IssuePurchasedGiftCardOnOrderPaidListener::class)->handle(
            new OrderPaid(OrderPaidData::fromOrder($order, true)),
        );

        $purchase->refresh();
        Cache::forget(GiftCardPurchaseDeliveryWindow::cacheKey((int) $purchase->id));
        $purchase->update([
            'code_delivery_expires_at' => now()->subHour(),
            'delivery_code_encrypted' => null,
        ]);

        $this->postJson(
            "/api/gift-cards/purchases/{$order->id}/resend",
            ['channel' => 'both'],
            $this->customerHeaders($customer),
        )->assertStatus(410);
    }
}
