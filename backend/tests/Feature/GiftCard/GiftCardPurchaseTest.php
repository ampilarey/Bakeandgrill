<?php

declare(strict_types=1);

namespace Tests\Feature\GiftCard;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Payments\Listeners\IssuePurchasedGiftCardOnOrderPaidListener;
use App\Domains\Payments\Services\GiftCardPurchaseDeliveryWindow;
use App\Domains\Payments\Services\PaymentService;
use App\Mail\GiftCardMail;
use App\Models\GiftCardPurchase;
use App\Models\Order;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
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
            'personal_note' => 'Enjoy!',
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
            'recipient_email' => 'buyer@example.com',
        ]);
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

        $this->assertArrayNotHasKey('code', $res->json());
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

        Cache::forget(GiftCardPurchaseDeliveryWindow::cacheKey((int) $purchase->id));

        $this->postJson(
            "/api/gift-cards/purchases/{$order->id}/resend",
            ['channel' => 'both'],
            $this->customerHeaders($customer),
        )->assertStatus(410);
    }
}
