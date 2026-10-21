<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Services;

use App\Domains\Credit\Services\CreditAccountNotifier;
use App\Domains\Deposits\Services\DepositNotifier;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Support\SmsNotificationSettings;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Enums\OrderType;
use App\Mail\OrderConfirmationMail;
use App\Models\Order;
use App\Models\Receipt;
use App\Support\OrderTrackingUrl;
use App\Support\ReceiptAccountLines;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Sends a payment confirmation SMS + optional email for a paid order.
 *
 * Called from PaymentService::confirmPayment / completeZeroBalanceOnlineOrder
 * (sync, inside DB::afterCommit) and from the queued
 * SendPaymentConfirmationListener on OrderPaid.
 *
 * The SmsService idempotency key ('order:paid:confirm:{order_number}') prevents duplicate
 * SMS delivery — whichever path fires first wins; the second is a no-op.
 */
class PaymentConfirmationNotifier
{
    private const ONLINE_TYPES = [
        OrderType::OnlinePickup->value,
        OrderType::Delivery->value,
    ];

    public function __construct(
        private readonly SmsService $sms,
        private readonly CustomerSmsMessageBuilder $messages,
        private readonly CreditAccountNotifier $credit,
    ) {}

    public function notify(Order $order): void
    {
        if ($order->type === 'gift_card') {
            return;
        }

        $order->loadMissing(['customer', 'payments']);

        $phone = $this->resolveRecipientPhone($order);
        $email = $order->customer?->email;
        $name = $order->customer?->name ?? 'Customer';

        if (!$phone && !$email) {
            Log::warning('PaymentConfirmationNotifier: no recipient phone or email', [
                'order_id' => $order->id,
                'order_type' => $order->type,
                'customer_id' => $order->customer_id,
            ]);

            return;
        }

        $isOnline = in_array((string) $order->type, self::ONLINE_TYPES, true);

        // Ensure a Receipt row exists for every paid order (online: for completion SMS + web receipt; POS: SMS + email).
        $receipt = Receipt::firstOrNew(['order_id' => $order->id]);
        if (!$receipt->exists) {
            $receipt->token = Str::random(48);
        }
        $receipt->customer_id = $order->customer_id;
        $receipt->fill([
            'channel' => $phone ? 'sms' : 'email',
            'recipient' => $phone ?: $email,
        ]);
        if (!$receipt->exists || !$receipt->sent_at) {
            $receipt->sent_at = now();
            $receipt->last_sent_at = now();
        }
        $receipt->save();

        // A catering quote paid online: the event confirmation already says
        // what was paid, so no till receipt text or email beside it (owner,
        // 2026-10-10). A balance paid later still gets its receipt.
        if ((string) $order->type === 'catering' && $this->eventConfirmationCoversPayment($order)) {
            return;
        }

        // What the sale did to the customer's credit account or wallet
        // (owner, 2026-10-21): a sale on credit is told by its own text, and
        // a sale paid from the wallet carries the balance left. Both read
        // the ledgers, which the settle wrote before this ran.
        $account = ReceiptAccountLines::for($order);
        $walletNote = $account['wallet'] !== null
            ? DepositNotifier::walletNote((int) $account['wallet']['amount_laar'], (int) $account['wallet']['balance_laar'], $phone, $account['wallet']['shared_from'] ?? null)
            : '';

        if ($isOnline && $account['credit'] !== null && CreditAccountNotifier::chargedTextOn()) {
            // An online order on the credit account (phase 4, owner
            // 2026-10-21): the charged text (amount, due date, what is owed,
            // the invoice to view or pay), with the ready hint and the
            // tracking link the customer needs because they are not in the
            // room. One order, one text.
            $url = $this->buildOrderStatusUrl($order);
            $readyHint = (string) $order->type === OrderType::Delivery->value
                ? "We'll text when we're on the way."
                : "We'll text when it's ready.";
            $message = $this->credit->chargedText($order, $account['credit'], $phone) . ' ' . $readyHint . ' ' . $url;
            $typeKey = CreditAccountNotifier::TYPE_CHARGED;
        } elseif ($isOnline) {
            // Online pickup / delivery: customer isn't in the room, so
            // surface (a) HOW the payment cleared (BML / cash on
            // pickup / etc) so they have something to reference if
            // anything goes wrong, and (b) a friendly "we'll text you
            // when it's ready" so the cashier doesn't get phone calls
            // asking for updates. The lifecycle SMS will follow at
            // 'ready' (handled by SendCustomerOrderStatusSmsListener).
            $url = $this->buildOrderStatusUrl($order);
            $method = $this->paymentMethodLabel($order);
            $readyHint = (string) $order->type === OrderType::Delivery->value
                ? "We'll text when we're on the way."
                : "We'll text when it's ready.";
            $fallback = 'Paid'
                . ($method ? ' via ' . $method : '')
                . '. #' . $order->order_number . ' confirmed. '
                . $readyHint . ' '
                . $url;
            $message = $this->messages->build(
                CustomerSmsMessageBuilder::SLUG_PAYMENT_CONFIRMED_ONLINE,
                [
                    'payment_method_suffix' => $method ? ' via ' . $method : '',
                    'order_number' => (string) $order->order_number,
                    'ready_hint' => $readyHint,
                    'tracking_url' => $url,
                    'wallet_note' => $walletNote,
                ],
                $fallback,
                $phone,
            );
            $typeKey = 'customer_payment_confirmed_online';
        } elseif ($account['credit'] !== null && CreditAccountNotifier::chargedTextOn()) {
            // A till sale on the credit account: amount, due date, what is
            // owed and available, and the invoice link to view or pay, in
            // place of the receipt text. One sale, one text.
            $url = rtrim(config('app.url'), '/') . '/receipts/' . $receipt->token;
            $message = $this->credit->chargedText($order, $account['credit'], $phone);
            $typeKey = CreditAccountNotifier::TYPE_CHARGED;
        } else {
            // POS dine-in / takeaway: customer is at the counter. The
            // receipt link is the only useful SMS — no order-confirmed
            // / preparing / ready noise (those listeners now skip
            // POS types).
            $url = rtrim(config('app.url'), '/') . '/receipts/' . $receipt->token;
            $fallback = 'Receipt for #' . $order->order_number . ': ' . $url;
            $message = $this->messages->build(
                CustomerSmsMessageBuilder::SLUG_PAYMENT_CONFIRMED_POS,
                [
                    'order_number' => (string) $order->order_number,
                    'receipt_url' => $url,
                    'wallet_note' => $walletNote,
                ],
                $fallback,
                $phone,
            );
            $typeKey = 'customer_payment_confirmed_pos';
        }

        // A wording without {{wallet_note}} of its own still carries it.
        if ($walletNote !== '' && !str_contains($message, trim($walletNote))) {
            $message .= $walletNote;
        }

        // The SMS switch saves SMS cost; it no longer stops the order
        // confirmation email (owner, 2026-10-06). Counter and online each
        // have their own switch since 2026-10-10 (one used to cover both);
        // the credit text has its own row.
        $smsOn = match ($typeKey) {
            'customer_payment_confirmed_online' => SmsNotificationSettings::isEnabled(SmsNotificationSettings::PAYMENT_CONFIRMED_ONLINE),
            'customer_payment_confirmed_pos' => SmsNotificationSettings::isEnabled(SmsNotificationSettings::PAYMENT_CONFIRMED_POS),
            default => SmsTypeRegistry::isTypeEnabled((array) SmsTypeRegistry::get($typeKey)),
        };

        if ($phone && $smsOn) {
            try {
                $this->sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: $typeKey,
                    customerId: $order->customer_id,
                    referenceType: 'order',
                    referenceId: (string) $order->id,
                    idempotencyKey: 'order:paid:confirm:' . $order->order_number,
                ));
            } catch (\Throwable $e) {
                Log::error('PaymentConfirmationNotifier: SMS failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        // The confirmation email's switch is the row's Email switch in
        // Admin → Notifications (2026-10-10), separate from the SMS one.
        // Up to three paths announce one payment (the confirm step, "payment
        // confirmed", "order paid"); the text has its once-per-order key, and
        // this claim on the receipt is the email's: it went three times
        // (owner, 2026-10-10). A failed send gives the claim back.
        if ($email && SmsTypeRegistry::isEmailEnabled($typeKey)
            && \App\Domains\Customers\Support\MessageChoices::allows($order->customer, \App\Domains\Customers\Support\MessageChoices::ORDERS, \App\Domains\Customers\Support\MessageChoices::EMAIL)
            && Receipt::whereKey($receipt->id)->whereNull('confirmation_email_sent_at')->update(['confirmation_email_sent_at' => now()]) === 1) {
            try {
                Mail::to($email)->locale(\App\Domains\Notifications\Support\CustomerSmsText::languageFor($phone, $email))->send(new OrderConfirmationMail($order, $url, $name));
            } catch (\Throwable $e) {
                Receipt::whereKey($receipt->id)->update(['confirmation_email_sent_at' => null]);
                Log::error('PaymentConfirmationNotifier: email failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    /**
     * True when the money on this catering order is what its quote asked
     * for: the payment that confirmed the event, whose own message says so.
     * More than that (a balance after a deposit, items added later) is a
     * payment of its own and gets the receipt.
     */
    private function eventConfirmationCoversPayment(Order $order): bool
    {
        $request = \App\Models\CateringRequest::query()->where('pos_order_id', $order->id)->first(['id', 'quote_payment_laar']);
        $quoted = (int) ($request?->quote_payment_laar ?? 0);
        if ($quoted <= 0) {
            return false;
        }
        $paid = (int) $order->payments
            ->whereIn('status', ['confirmed', 'paid', 'completed'])
            ->sum('amount_laar');

        return $paid > 0 && $paid <= $quoted;
    }

    /**
     * Human-readable label for the payment method(s) used on this
     * order — used in the online payment-received SMS so the
     * customer has a reference if anything goes wrong. Returns
     * null if the order has no confirmed payments yet (caller
     * leaves the "via X" clause out entirely).
     */
    private function paymentMethodLabel(Order $order): ?string
    {
        $methods = $order->payments
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->pluck('method')
            ->filter()
            ->map(fn ($m) => match ((string) $m) {
                'bml_pay', 'bml', 'bml_connect', 'online' => 'BML Pay',
                'cash' => 'cash',
                'card', 'card_pos' => 'card',
                'qr' => 'QR',
                'bank_transfer', 'digital_wallet' => 'transfer',
                'gift_card' => 'gift card',
                'loyalty' => 'loyalty points',
                'house_account' => 'credit',
                'wallet', 'customer_deposit' => 'deposit',
                default => str_replace('_', ' ', (string) $m),
            })
            ->unique()
            ->values();

        if ($methods->isEmpty()) {
            return null;
        }

        // "BML Pay" or "cash + card" (rare split-tender case)
        return $methods->implode(' + ');
    }

    private function resolveRecipientPhone(Order $order): ?string
    {
        $phone = $order->customer?->phone;
        if (is_string($phone) && trim($phone) !== '') {
            return $phone;
        }

        if ((string) $order->type === OrderType::Delivery->value) {
            $deliveryPhone = $order->delivery_contact_phone;
            if (is_string($deliveryPhone) && trim($deliveryPhone) !== '') {
                return $deliveryPhone;
            }
        }

        return null;
    }

    private function buildOrderStatusUrl(Order $order): string
    {
        return OrderTrackingUrl::for($order);
    }
}
