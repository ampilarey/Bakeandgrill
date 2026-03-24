<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Domains\Payments\DTOs\PaymentConfirmedData;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Payments\Repositories\PaymentRepositoryInterface;
use App\Domains\Payments\StateMachine\PaymentStateMachine;
use App\Models\Order;
use App\Models\Payment;
use App\Models\WebhookLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class PaymentService
{
    public function __construct(
        private BmlConnectService $bml,
        private PaymentRepositoryInterface $payments,
        private OrderRepositoryInterface $orders,
    ) {}

    /**
     * Initiate a BML online payment for an order (full amount).
     * Returns the redirect URL for the customer.
     *
     * @param int|null $amountLaar Override amount in laari. Null = full order total.
     * @param string|null $idempotencyKey Caller-supplied idempotency key (for partial payments).
     */
    public function initiateBmlPayment(Order $order, ?int $amountLaar = null, ?string $idempotencyKey = null): array
    {
        $amountLaar = $amountLaar ?? (int) round($order->total * 100);
        $idempotencyKey = $idempotencyKey ?? ('bml:init:' . $order->id . ':' . now()->format('Ymd'));
        $localId = $this->bml->normalizeLocalId('BG-' . $order->order_number . '-' . now()->format('His'));

        $payment = DB::transaction(function () use ($order, $idempotencyKey, $localId, $amountLaar) {
            return $this->payments->firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'order_id' => $order->id,
                    'method' => 'bml_connect',
                    'gateway' => 'bml',
                    'currency' => config('bml.default_currency', 'MVR'),
                    'amount' => round($amountLaar / 100, 2),
                    'amount_laar' => $amountLaar,
                    'local_id' => $localId,
                    'status' => 'created',
                    'processed_at' => now(),
                ],
            );
        });

        // Payment already initiated — reconstruct the BML pay URL from stored transaction ID.
        if ($payment->status === 'initiated') {
            $baseUrl = rtrim(config('bml.base_url', 'https://api.merchants.bankofmaldives.com.mv'), '/');
            $payUrl = $payment->provider_transaction_id
                ? "{$baseUrl}/pay/{$payment->provider_transaction_id}"
                : null;

            Log::info('BML: Reusing existing initiated payment', [
                'payment_id' => $payment->id,
                'order_id' => $order->id,
                'transaction_id' => $payment->provider_transaction_id,
                'payment_url' => $payUrl,
            ]);

            return [
                'payment_url' => $payUrl,
                'payment_id' => $payment->id,
                'local_id' => $payment->local_id,
                'reused' => true,
            ];
        }

        // Payment in an unexpected terminal state — create a fresh one.
        if (!in_array($payment->status, ['created'], true)) {
            Log::warning('BML: Payment in unexpected state, issuing new attempt', [
                'payment_id' => $payment->id,
                'status' => $payment->status,
            ]);
            $idempotencyKey .= ':retry:' . now()->timestamp;
            $localId = $this->bml->normalizeLocalId('BG-' . $order->order_number . '-' . now()->format('His'));

            $payment = $this->payments->create([
                'idempotency_key' => $idempotencyKey,
                'order_id' => $order->id,
                'method' => 'bml_connect',
                'gateway' => 'bml',
                'currency' => config('bml.default_currency', 'MVR'),
                'amount' => round($amountLaar / 100, 2),
                'amount_laar' => $amountLaar,
                'local_id' => $localId,
                'status' => 'created',
                'processed_at' => now(),
            ]);
        }

        // Include orderId in the return URL so bmlReturn() can redirect to the right order page.
        // BML appends its own params (&state=...&transactionId=...) to whatever URL we provide.
        $bmlReturnUrl = rtrim(config('bml.return_url'), '/') . '?orderId=' . $order->id;

        $result = $this->bml->createPayment(
            $payment->amount_laar,
            $localId,
            returnUrl: $bmlReturnUrl,
        );

        // Persist transaction ID and advance state via the state machine so all
        // payment status changes go through a single, validated transition path.
        PaymentStateMachine::for($payment)->transition('initiated', [
            'provider_transaction_id' => $result['transaction_id'],
        ]);

        Log::info('BML: Payment initiated', [
            'payment_id' => $payment->id,
            'order_id' => $order->id,
            'local_id' => $localId,
            'amount_laar' => $amountLaar,
            'transaction_id' => $result['transaction_id'],
        ]);

        return [
            'payment_url' => $result['payment_url'],
            'payment_id' => $payment->id,
            'local_id' => $localId,
            'reused' => false,
        ];
    }

    /**
     * Calculate the remaining balance for an order in laari.
     */
    public function getRemainingBalanceLaar(Order $order): int
    {
        $paidLaar = $this->payments->sumAmountLaarForOrder(
            $order->id,
            ['confirmed', 'paid', 'completed'],
        );

        $orderTotalLaar = $order->total_laar ?? (int) round($order->total * 100);

        return max(0, $orderTotalLaar - $paidLaar);
    }

    /**
     * Initiate a partial BML payment.
     */
    public function initiatePartialBmlPayment(Order $order, int $amountLaar, string $idempotencyKey): array
    {
        $remainingLaar = $this->getRemainingBalanceLaar($order);

        if ($amountLaar <= 0) {
            throw new \InvalidArgumentException('Amount must be greater than zero.');
        }

        if ($amountLaar > $remainingLaar) {
            throw new \InvalidArgumentException(
                "Amount ({$amountLaar} laari) exceeds remaining balance ({$remainingLaar} laari).",
            );
        }

        $result = $this->initiateBmlPayment($order, $amountLaar, 'partial:' . $idempotencyKey);

        return array_merge($result, [
            'remaining_balance_before_laar' => $remainingLaar,
            'remaining_balance_after_laar' => $remainingLaar - $amountLaar,
            'amount_laar' => $amountLaar,
        ]);
    }

    /**
     * Fallback confirmation triggered from the BML return URL.
     * Used when webhooks are unreliable (e.g. UAT). Verifies the transaction
     * directly with BML's API, then runs the same confirmation logic as the webhook.
     * Safe to call multiple times — confirmPayment() is idempotent.
     */
    public function confirmFromReturnUrl(int $orderId, string $transactionId): void
    {
        // Prefer lookup by transactionId so we confirm the exact payment attempt
        // the customer completed, not just "the latest one for this order".
        // If the customer retried payment, findByOrderId() would return the newer
        // (not-yet-confirmed) attempt and then confirm the wrong record (L-4).
        $payment = $this->payments->findByProviderTransactionId($transactionId)
            ?? $this->payments->findByOrderId($orderId);

        if (!$payment) {
            Log::info('BML return: no payment record for order', [
                'order_id'       => $orderId,
                'transaction_id' => $transactionId,
            ]);

            return;
        }

        // Already confirmed — nothing to do.
        if (in_array($payment->status, ['confirmed', 'paid', 'completed'], true)) {
            Log::info('BML return: payment already confirmed', ['payment_id' => $payment->id]);

            return;
        }

        // Verify with BML.
        try {
            $bmlStatus = $this->bml->getTransactionStatus($transactionId);
        } catch (\Throwable $e) {
            Log::warning('BML return: could not verify transaction status', [
                'transaction_id' => $transactionId,
                'error' => $e->getMessage(),
            ]);

            return;
        }

        $state = $bmlStatus['state'] ?? $bmlStatus['status'] ?? null;

        if ($state !== 'CONFIRMED') {
            Log::info('BML return: transaction not confirmed via API', [
                'transaction_id' => $transactionId,
                'state' => $state,
            ]);

            return;
        }

        Log::info('BML return: confirming payment via fallback', [
            'order_id' => $orderId,
            'transaction_id' => $transactionId,
            'payment_id' => $payment->id,
        ]);

        $this->confirmPayment($payment, array_merge($bmlStatus, [
            'transactionId' => $transactionId,
            'localId' => $payment->local_id,
            'source' => 'return_url_fallback',
        ]));
    }

    /**
     * Handle incoming BML webhook.
     * Idempotent: protected by unique idempotency_key on webhook_logs.
     */
    public function handleBmlWebhook(string $rawBody, array $headers): void
    {
        $payload = json_decode($rawBody, true) ?? [];

        // headers->all() returns arrays per header; extract the scalar value
        $sigHeader = config('bml.webhook_signature_header', 'X-BML-Signature');
        $rawSig = $headers[$sigHeader] ?? $headers[strtolower($sigHeader)] ?? $headers['x-signature'] ?? $headers['X-Signature'] ?? null;
        $signature = is_array($rawSig) ? ($rawSig[0] ?? '') : ($rawSig ?? '');

        $idempotencyKey = 'bml:webhook:' . ($payload['transactionId'] ?? Str::uuid());

        $log = DB::transaction(function () use ($idempotencyKey, $rawBody, $payload, $headers): WebhookLog {
            return WebhookLog::firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'gateway' => 'bml',
                    'gateway_event_id' => $payload['transactionId'] ?? null,
                    'event_type' => $payload['state'] ?? 'unknown',
                    'headers' => $headers,
                    'raw_body' => $rawBody,
                    'payload' => $payload,
                    'status' => 'received',
                ],
            );
        });

        if ($log->status !== 'received') {
            Log::info('BML: Duplicate webhook, skipping', ['idempotency_key' => $idempotencyKey]);

            return;
        }

        try {
            if (!$this->bml->verifyWebhookSignature($rawBody, $signature)) {
                Log::warning('BML: Webhook signature mismatch. Verify BML_WEBHOOK_SECRET matches the portal.', [
                    'idempotency_key' => $idempotencyKey,
                ]);

                if (config('app.env') === 'production' && config('bml.enforce_signature', true)) {
                    throw new \RuntimeException('BML webhook signature verification failed — rejecting payload.');
                }
            }

            $this->processWebhookPayload($payload, $log);
            $log->update(['status' => 'processed', 'processed_at' => now()]);
        } catch (\Throwable $e) {
            $log->update(['status' => 'failed', 'error_message' => $e->getMessage()]);
            Log::error('BML: Webhook processing failed', [
                'idempotency_key' => $idempotencyKey,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    private function processWebhookPayload(array $payload, WebhookLog $log): void
    {
        $transactionId = $payload['transactionId'] ?? null;
        $state = $payload['state'] ?? null;
        $localId = $payload['localId'] ?? null;

        Log::info('BML: Processing webhook', [
            'transaction_id' => $transactionId,
            'state' => $state,
            'local_id' => $localId,
        ]);

        if (!$transactionId || !$localId) {
            throw new \RuntimeException('BML webhook missing transactionId or localId');
        }

        $payment = $this->payments->findByLocalId($localId);
        if (!$payment) {
            Log::warning('BML: No payment found for localId', ['local_id' => $localId]);

            return;
        }

        if ($state === 'CONFIRMED') {
            $this->confirmPayment($payment, $payload);
        } elseif (in_array($state, ['FAILED', 'CANCELLED', 'EXPIRED'], true)) {
            $target = strtolower($state);
            $sm = PaymentStateMachine::for($payment);
            if ($sm->can($target)) {
                $sm->transition($target, ['gateway_response' => $payload]);
            } else {
                // Late or duplicate webhook — payment already in a terminal state; ignore.
                Log::info('BML: Payment cannot transition to terminal state (late/duplicate webhook)', [
                    'payment_id'     => $payment->id,
                    'current_status' => $payment->status,
                    'webhook_state'  => $state,
                ]);
            }
        } else {
            Log::info('BML: Unknown state', ['state' => $state]);
        }
    }

    private function confirmPayment(Payment $payment, array $payload): void
    {
        DB::transaction(function () use ($payment, $payload): void {
            // Re-fetch with a row lock inside the transaction so two concurrent
            // webhooks / return-URL callbacks can't both pass the status check
            // (C-1: TOCTOU race condition → double loyalty earn, double inventory deduction).
            $locked = Payment::where('id', $payment->id)->lockForUpdate()->first();
            $sm = $locked ? PaymentStateMachine::for($locked) : null;

            if (!$locked || !$sm->can('confirmed')) {
                Log::info('BML: Payment already confirmed or cannot transition (concurrent request), skipping', [
                    'payment_id'     => $payment->id,
                    'current_status' => $locked?->status ?? 'not found',
                ]);

                return;
            }

            // Advance status via state machine — single validated transition path.
            $sm->transition('confirmed', ['gateway_response' => $payload]);

            $order = $this->orders->findById($locked->order_id);
            if (!$order) {
                Log::error('BML: Order not found during payment confirmation', [
                    'payment_id' => $locked->id,
                    'order_id' => $locked->order_id,
                ]);

                return;
            }

            // C-2: Compare in laari (integer) to avoid float precision errors where
            // e.g. 100.00 (float) >= 100.00 (float) could fail with 99.9999... representation.
            $paidLaar  = $this->payments->sumAmountLaarForOrder($order->id, ['paid', 'confirmed', 'completed']);
            $orderLaar = (int) round((float) $order->total * 100);

            Log::info('BML: Payment confirmed', [
                'payment_id'  => $locked->id,
                'order_id'    => $order->id,
                'paid_laar'   => $paidLaar,
                'order_laar'  => $orderLaar,
            ]);

            PaymentConfirmed::dispatch(PaymentConfirmedData::fromPaymentAndOrder($locked, $order));

            // Deduct gift card balance now that payment is confirmed.
            // Skip if no gift card was used or discount is zero.
            if (!empty($order->gift_card_code) && (int) ($order->gift_card_discount_laar ?? 0) > 0) {
                $giftCard = \App\Models\GiftCard::where('code', $order->gift_card_code)
                    ->where('status', 'active')
                    ->lockForUpdate()
                    ->first();

                if ($giftCard) {
                    $deductLaar    = (int) $order->gift_card_discount_laar;
                    $deductMvr     = round($deductLaar / 100, 2);
                    $newBalance    = max(0, (float) $giftCard->current_balance - $deductMvr);

                    $giftCard->update([
                        'current_balance' => $newBalance,
                        'status'          => $newBalance <= 0 ? 'redeemed' : 'active',
                    ]);

                    \App\Models\GiftCardTransaction::create([
                        'gift_card_id'  => $giftCard->id,
                        'amount'        => -$deductMvr,
                        'type'          => 'redeem',
                        'balance_after' => $newBalance,
                        'order_id'      => $order->id,
                    ]);
                }
            }

            if ($paidLaar >= $orderLaar && !in_array($order->status, ['paid', 'completed'], true)) {
                // Online orders held at payment_pending: move to pending so KDS/kitchen can see them.
                // POS orders already in the kitchen queue go straight to paid.
                $newStatus = $order->status === 'payment_pending' ? 'pending' : 'paid';
                $this->orders->updateStatus($order->id, $newStatus, ['paid_at' => now()]);

                DB::afterCommit(function () use ($order): void {
                    $freshOrder = $this->orders->findById($order->id);
                    if ($freshOrder) {
                        OrderPaid::dispatch(OrderPaidData::fromOrder($freshOrder, true));
                    }
                });
            }
        });
    }
}
