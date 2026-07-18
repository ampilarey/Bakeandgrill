<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Models\GiftCard;
use App\Models\GiftCardPurchase;
use App\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Issue + deliver a purchased gift card after payment.
 * Card creation commits independently of SMS/email so delivery failures
 * cannot roll back the issued card. Plaintext is stored (encrypted) before send
 * so the customer can resend for 48 hours.
 */
final class GiftCardPurchaseFulfillmentService
{
    public const MAX_DELIVERY_RECOVERIES = 1;

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
        $alreadyIssued = false;

        DB::transaction(function () use ($order, &$plain, &$purchaseId, &$alreadyIssued): void {
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
                $alreadyIssued = true;

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

        if (is_string($plain) && $plain !== '') {
            // Persist code BEFORE send so resend works even if SMS/email fail.
            $this->deliveryWindow->store($purchase, $plain);
            $purchase->refresh();
            $this->deliver($purchase, $plain);

            return $purchase->fresh(['giftCard']);
        }

        if ($alreadyIssued) {
            return $this->recoverDelivery($purchase);
        }

        return $purchase->fresh(['giftCard']);
    }

    /**
     * Re-send if we still have the plaintext; otherwise replace an unused card once
     * so the customer can receive a code after a failed first delivery.
     */
    public function recoverDelivery(GiftCardPurchase $purchase): GiftCardPurchase
    {
        $purchase->loadMissing('giftCard');

        if ($this->deliverySucceeded($purchase)) {
            return $purchase->fresh(['giftCard']) ?? $purchase;
        }

        $plain = $this->deliveryWindow->plainCode($purchase);
        if (is_string($plain) && $plain !== '') {
            $this->deliver($purchase, $plain);

            return $purchase->fresh(['giftCard']) ?? $purchase;
        }

        return $this->reissueUnusedCard($purchase);
    }

    private function reissueUnusedCard(GiftCardPurchase $purchase): GiftCardPurchase
    {
        $card = $purchase->giftCard;
        if (!$card) {
            return $purchase;
        }

        $recoveryCount = Schema::hasColumn('gift_card_purchases', 'delivery_recovery_count')
            ? (int) ($purchase->delivery_recovery_count ?? 0)
            : 0;

        if ($recoveryCount >= self::MAX_DELIVERY_RECOVERIES) {
            Log::warning('GiftCardPurchaseFulfillment: recovery limit reached', [
                'order_id' => $purchase->order_id,
                'purchase_id' => $purchase->id,
            ]);

            return $purchase;
        }

        // Only replace if the card was never spent.
        if ((float) $card->current_balance + 0.001 < (float) $card->initial_balance) {
            Log::warning('GiftCardPurchaseFulfillment: cannot recover — card already used', [
                'order_id' => $purchase->order_id,
                'gift_card_id' => $card->id,
            ]);

            return $purchase;
        }

        $plain = null;

        DB::transaction(function () use ($purchase, &$plain, $recoveryCount): void {
            $locked = GiftCardPurchase::query()->lockForUpdate()->find($purchase->id);
            if (!$locked || !$locked->gift_card_id) {
                return;
            }

            $lockedCard = GiftCard::query()->lockForUpdate()->find($locked->gift_card_id);
            if (!$lockedCard) {
                return;
            }

            if ((float) $lockedCard->current_balance + 0.001 < (float) $lockedCard->initial_balance) {
                return;
            }

            $lockedCard->update(['status' => 'cancelled']);

            $issued = $this->issuer->issue([
                'amount' => (float) $locked->amount,
                'purchased_by_customer_id' => $locked->purchaser_customer_id,
                'issued_to_customer_id' => $locked->purchaser_customer_id,
            ]);

            $updates = [
                'gift_card_id' => $issued['card']->id,
                'sms_ok' => null,
                'email_ok' => null,
                'resend_count' => 0,
            ];
            if (Schema::hasColumn('gift_card_purchases', 'delivery_recovery_count')) {
                $updates['delivery_recovery_count'] = $recoveryCount + 1;
            }

            $locked->update($updates);
            $plain = $issued['plain'];
        });

        $purchase = GiftCardPurchase::query()->with('giftCard')->find($purchase->id) ?? $purchase;

        if (!is_string($plain) || $plain === '') {
            return $purchase;
        }

        $this->deliveryWindow->store($purchase, $plain);
        $purchase->refresh();
        $this->deliver($purchase, $plain);

        Log::info('GiftCardPurchaseFulfillment: reissued undelivered purchase', [
            'order_id' => $purchase->order_id,
            'purchase_id' => $purchase->id,
            'new_gift_card_id' => $purchase->gift_card_id,
        ]);

        return $purchase->fresh(['giftCard']) ?? $purchase;
    }

    private function deliverySucceeded(GiftCardPurchase $purchase): bool
    {
        $smsOk = $purchase->sms_ok === true;
        $emailOk = $purchase->email_ok === true;
        if ($smsOk || $emailOk) {
            return true;
        }

        // No channel configured — nothing to deliver.
        return !$purchase->recipient_phone && !$purchase->recipient_email;
    }

    private function deliver(GiftCardPurchase $purchase, string $plain): void
    {
        $card = $purchase->giftCard;
        if (!$card) {
            return;
        }

        $note = $purchase->personal_note;
        $fromLine = $purchase->senderFromLine();
        $viewUrl = $this->deliveryWindow->viewUrl($purchase);
        $smsOk = $purchase->sms_ok;
        $emailOk = $purchase->email_ok;

        if ($purchase->recipient_phone && $smsOk !== true) {
            $sent = $this->sms->send(
                $card,
                $plain,
                $purchase->recipient_phone,
                $note,
                $purchase->purchaser_customer_id,
                null,
                $viewUrl,
                $fromLine,
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
                $fromLine,
                $viewUrl,
            );
            $emailOk = (bool) $sent['ok'];
            if (!$emailOk) {
                Log::warning('Gift card purchase email failed', [
                    'order_id' => $purchase->order_id,
                    'error' => $sent['error'],
                ]);
            }
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
