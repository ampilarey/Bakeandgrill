<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Models\GiftCardPurchase;
use App\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Issue + deliver a purchased gift card after payment.
 * Card creation commits independently of SMS/email/cache so a delivery
 * failure (or a missing optional column) cannot roll back the issued card.
 */
final class GiftCardPurchaseFulfillmentService
{
    public function __construct(
        private readonly GiftCardIssueService $issuer,
        private readonly GiftCardSmsDelivery $sms,
        private readonly GiftCardEmailDelivery $email,
        private readonly GiftCardPurchaseDeliveryWindow $deliveryWindow,
    ) {}

    /**
     * Idempotent. Returns the purchase row (with giftCard) when a card is linked.
     */
    public function fulfill(Order $order): ?GiftCardPurchase
    {
        if ($order->type !== 'gift_card') {
            return null;
        }

        $plain = null;
        $purchaseId = null;

        DB::transaction(function () use ($order, &$plain, &$purchaseId): void {
            $purchase = GiftCardPurchase::query()
                ->where('order_id', $order->id)
                ->lockForUpdate()
                ->first();

            if (!$purchase) {
                Log::warning('GiftCardPurchaseFulfillment: no purchase row', [
                    'order_id' => $order->id,
                ]);

                return;
            }

            if ($purchase->gift_card_id) {
                $purchaseId = (int) $purchase->id;

                return;
            }

            $issued = $this->issuer->issue([
                'amount' => (float) $purchase->amount,
                'purchased_by_customer_id' => $purchase->purchaser_customer_id,
                'issued_to_customer_id' => $purchase->purchaser_customer_id,
            ]);

            $purchase->update([
                'gift_card_id' => $issued['card']->id,
            ]);

            $plain = $issued['plain'];
            $purchaseId = (int) $purchase->id;

            $freshOrder = Order::query()->lockForUpdate()->find($order->id);
            if ($freshOrder && $freshOrder->status !== 'completed') {
                $freshOrder->forceFill([
                    'status' => 'completed',
                    'payment_status' => 'paid',
                    'completed_at' => now(),
                    'paid_at' => $freshOrder->paid_at ?? now(),
                ])->save();
            }
        });

        if ($purchaseId === null) {
            return null;
        }

        $purchase = GiftCardPurchase::query()
            ->with('giftCard')
            ->find($purchaseId);

        if (!$purchase?->gift_card_id || !$purchase->giftCard) {
            return $purchase;
        }

        // Delivery is best-effort and must not undo a committed card.
        if (is_string($plain) && $plain !== '') {
            $this->deliver($purchase, $plain);
        }

        return $purchase->fresh(['giftCard']);
    }

    private function deliver(GiftCardPurchase $purchase, string $plain): void
    {
        $card = $purchase->giftCard;
        if (!$card) {
            return;
        }

        $note = $purchase->personal_note;
        $smsOk = $purchase->sms_ok;
        $emailOk = $purchase->email_ok;

        if ($purchase->recipient_phone && $smsOk !== true) {
            $sent = $this->sms->send(
                $card,
                $plain,
                $purchase->recipient_phone,
                $note,
                $purchase->purchaser_customer_id,
            );
            $smsOk = (bool) $sent['ok'];
            if (!$smsOk) {
                Log::warning('Gift card purchase SMS failed', [
                    'order_id' => $purchase->order_id,
                    'error' => $sent['error'],
                ]);
            }
        }

        if ($purchase->recipient_email && $emailOk !== true) {
            $sent = $this->email->send(
                $card,
                $plain,
                $purchase->recipient_email,
                $note,
            );
            $emailOk = (bool) $sent['ok'];
            if (!$emailOk) {
                Log::warning('Gift card purchase email failed', [
                    'order_id' => $purchase->order_id,
                    'error' => $sent['error'],
                ]);
            }
        }

        try {
            $this->deliveryWindow->store($purchase->fresh() ?? $purchase, $plain);
        } catch (\Throwable $e) {
            Log::warning('Gift card purchase delivery window store failed', [
                'order_id' => $purchase->order_id,
                'error' => $e->getMessage(),
            ]);
        }

        $updates = [];
        if (Schema::hasColumn('gift_card_purchases', 'sms_ok')) {
            $updates['sms_ok'] = $smsOk;
        }
        if (Schema::hasColumn('gift_card_purchases', 'email_ok')) {
            $updates['email_ok'] = $emailOk;
        }
        if ($updates !== []) {
            $purchase->update($updates);
        }
    }
}
