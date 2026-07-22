<?php

declare(strict_types=1);

namespace Tests\Feature\GiftCard;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\DTOs\OrderRefundedData;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Payments\Listeners\IssuePurchasedGiftCardOnOrderPaidListener;
use App\Domains\Payments\Listeners\VoidPurchasedGiftCardOnRefundListener;
use App\Models\AuditLog;
use App\Models\GiftCard;
use App\Models\GiftCardPurchase;
use App\Models\GiftCardTransaction;
use App\Models\Order;
use App\Models\Refund;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class GiftCardRefundVoidTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Build a paid gift-card purchase order with an issued (never-spent) card.
     *
     * @return array{order: Order, card: GiftCard, purchase: GiftCardPurchase, refund: Refund}
     */
    private function makePaidPurchaseWithCard(int $mvr = 150): array
    {
        Mail::fake();

        $customer = $this->makeCustomer([
            'phone' => '+960777' . random_int(1000, 9999),
            'email' => 'buyer' . random_int(1, 99999) . '@example.com',
        ]);

        $order = Order::create([
            'order_number' => 'GC-VOID-' . random_int(1000, 9999),
            'tracking_token' => 'gcvoid' . random_int(1000, 9999),
            'type' => 'gift_card',
            'status' => 'paid',
            'payment_status' => 'paid',
            'customer_id' => $customer->id,
            'subtotal' => $mvr,
            'subtotal_laar' => $mvr * 100,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'discount_amount' => 0,
            'total' => $mvr,
            'total_laar' => $mvr * 100,
            'paid_at' => now(),
        ]);

        GiftCardPurchase::create([
            'order_id' => $order->id,
            'purchaser_customer_id' => $customer->id,
            'amount' => $mvr,
            'recipient_phone' => $customer->phone,
            'recipient_email' => $customer->email,
        ]);

        // Fire the paid listener to actually issue the card + link it to the purchase.
        app(IssuePurchasedGiftCardOnOrderPaidListener::class)->handle(
            new OrderPaid(OrderPaidData::fromOrder($order->fresh(), true)),
        );

        $purchase = GiftCardPurchase::where('order_id', $order->id)->first();
        $card = GiftCard::findOrFail($purchase->gift_card_id);
        $refund = Refund::create([
            'order_id' => $order->id,
            'amount' => $mvr,
            'status' => 'approved',
        ]);

        return ['order' => $order->fresh(), 'card' => $card, 'purchase' => $purchase, 'refund' => $refund];
    }

    public function test_refund_of_never_spent_purchase_voids_full_balance(): void
    {
        $ctx = $this->makePaidPurchaseWithCard(150);

        app(VoidPurchasedGiftCardOnRefundListener::class)->handle(
            new OrderRefunded(OrderRefundedData::fromRefund($ctx['refund'], 1.0)),
        );

        $card = $ctx['card']->fresh();
        $this->assertSame('cancelled', $card->status);
        $this->assertEqualsWithDelta(0.0, (float) $card->current_balance, 0.001);

        $void = GiftCardTransaction::where('gift_card_id', $card->id)
            ->where('type', 'void')
            ->where('refund_id', $ctx['refund']->id)
            ->first();
        $this->assertNotNull($void);
        $this->assertEqualsWithDelta(-150.0, (float) $void->amount, 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $void->balance_after, 0.001);
    }

    public function test_refund_of_partially_spent_purchase_only_voids_residual_and_audits(): void
    {
        $ctx = $this->makePaidPurchaseWithCard(200);
        // Simulate 50 MVR spent — leaves 150 residual.
        $ctx['card']->update(['current_balance' => 150]);

        app(VoidPurchasedGiftCardOnRefundListener::class)->handle(
            new OrderRefunded(OrderRefundedData::fromRefund($ctx['refund'], 1.0)),
        );

        $card = $ctx['card']->fresh();
        $this->assertSame('cancelled', $card->status);
        $this->assertEqualsWithDelta(0.0, (float) $card->current_balance, 0.001);

        $void = GiftCardTransaction::where('gift_card_id', $card->id)
            ->where('type', 'void')->first();
        $this->assertNotNull($void);
        $this->assertEqualsWithDelta(-150.0, (float) $void->amount, 0.001);

        $audit = AuditLog::where('action', 'gift_card.voided_on_refund')
            ->where('model_id', $card->id)
            ->first();
        $this->assertNotNull($audit);
        $this->assertSame(5000, $audit->new_values['spent_laar'] ?? null);
        $this->assertSame(15000, $audit->new_values['voided_laar'] ?? null);
    }

    public function test_partial_refund_of_gift_card_purchase_is_rejected(): void
    {
        // Build a paid gift-card order WITHOUT the pre-created Refund row so
        // alreadyRefundedLaar starts at 0 and the partial-refund guard fires.
        Mail::fake();

        $customer = $this->makeCustomer(['phone' => '+9607765432', 'email' => 'partialgc@example.com']);

        $order = Order::create([
            'order_number' => 'GC-PART-001',
            'tracking_token' => 'gcpart1',
            'type' => 'gift_card',
            'status' => 'paid',
            'payment_status' => 'paid',
            'customer_id' => $customer->id,
            'subtotal' => 200,
            'subtotal_laar' => 20000,
            'tax_amount' => 0,
            'tax_laar' => 0,
            'total' => 200,
            'total_laar' => 20000,
            'paid_at' => now(),
        ]);

        \App\Models\Payment::create([
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => 200,
            'amount_laar' => 20000,
            'status' => 'paid',
        ]);

        $owner = $this->makeOwner();
        \App\Models\Shift::create([
            'user_id' => $owner->id,
            'opened_at' => now(),
            'opening_cash' => 0,
        ]);

        $res = $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 50, 'reason' => 'partial'],
            $this->staffHeaders($owner),
        );
        $res->assertStatus(422);
        $this->assertStringContainsString('Gift card purchases', (string) $res->json('message'));
    }

    public function test_double_order_refunded_events_write_single_void_row(): void
    {
        $ctx = $this->makePaidPurchaseWithCard(150);

        $event = new OrderRefunded(OrderRefundedData::fromRefund($ctx['refund'], 1.0));
        app(VoidPurchasedGiftCardOnRefundListener::class)->handle($event);
        app(VoidPurchasedGiftCardOnRefundListener::class)->handle($event);

        $count = GiftCardTransaction::where('gift_card_id', $ctx['card']->id)
            ->where('type', 'void')
            ->count();
        $this->assertSame(1, $count);
    }
}
