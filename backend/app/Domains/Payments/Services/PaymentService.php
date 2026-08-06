<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Notifications\Services\PaymentConfirmationNotifier;
use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderCancelled;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Domains\Payments\DTOs\PaymentConfirmedData;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Payments\Gateway\BmlConnectService;
use App\Domains\Payments\Repositories\PaymentRepositoryInterface;
use App\Domains\Payments\StateMachine\PaymentStateMachine;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Shift;
use App\Models\WebhookLog;
use App\Support\LaariConverter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class PaymentService
{
    public function __construct(
        private BmlConnectService $bml,
        private PaymentRepositoryInterface $payments,
        private OrderRepositoryInterface $orders,
        private PaymentConfirmationNotifier $confirmationNotifier,
        private OrderPaymentStateService $paymentState,
        private PaymentCommissionService $paymentCommission,
    ) {}

    /**
     * Initiate a BML online payment for an order (full amount).
     * Returns the redirect URL for the customer.
     *
     * @param int|null $amountLaar Override amount in laari. Null = full order total.
     * @param string|null $idempotencyKey Caller-supplied idempotency key (for partial payments).
     */
    public function initiateBmlPayment(
        Order $order,
        ?int $amountLaar = null,
        ?string $idempotencyKey = null,
        ?string $returnUrl = null,
    ): array {
        $amountLaar = $amountLaar ?? $this->orderTotalLaar($order);
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

        // ALWAYS send the persisted local_id. When firstOrCreate reused an
        // existing 'created' payment (first attempt failed before reaching
        // 'initiated'), the freshly generated timestamp-based $localId differs
        // from the stored one — and the BML webhook resolves payments by
        // localId, so a mismatch leaves a paid transaction unreconciled.
        $localId = $payment->local_id;

        // Include orderId in the return URL so bmlReturn() can redirect to the right order page.
        // BML appends its own params (&state=...&transactionId=...) to whatever URL we provide.
        $bmlReturnUrl = $returnUrl ?? (rtrim((string) config('bml.return_url'), '/') . '?orderId=' . $order->id);

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

        $orderTotalLaar = $this->orderTotalLaar($order);

        // Soft-held gift-card tender counts toward the amount already covered
        // until a gift_card payment row is written at settle.
        $giftTenderLaar = max(0, (int) ($order->gift_card_discount_laar ?? 0));
        if ($giftTenderLaar > 0) {
            $giftPaidLaar = (int) Payment::query()
                ->where('order_id', $order->id)
                ->where('method', 'gift_card')
                ->whereIn('status', ['confirmed', 'paid', 'completed'])
                ->selectRaw('SUM(COALESCE(amount_laar, ROUND(amount * 100))) as t')
                ->value('t');
            if ($giftPaidLaar <= 0) {
                $paidLaar += $giftTenderLaar;
            }
        }

        return max(0, $orderTotalLaar - $paidLaar);
    }

    /**
     * Initiate a partial BML payment.
     * Wraps the balance check + payment creation in a transaction with a row-lock
     * so two concurrent requests cannot both pass the "amount <= remaining" check
     * and together exceed the order total.
     */
    public function initiatePartialBmlPayment(
        Order $order,
        int $amountLaar,
        string $idempotencyKey,
        ?string $returnUrl = null,
    ): array {
        if ($amountLaar <= 0) {
            throw new \InvalidArgumentException('Amount must be greater than zero.');
        }

        return DB::transaction(function () use ($order, $amountLaar, $idempotencyKey, $returnUrl): array {
            // Lock the order row for the duration of this transaction so a concurrent
            // partial-payment request cannot read the same remaining balance.
            $locked = Order::where('id', $order->id)->lockForUpdate()->firstOrFail();

            $remainingLaar = $this->getRemainingBalanceLaar($locked);

            if ($amountLaar > $remainingLaar) {
                throw new \InvalidArgumentException(
                    "Amount ({$amountLaar} laari) exceeds remaining balance ({$remainingLaar} laari).",
                );
            }

            $result = $this->initiateBmlPayment($locked, $amountLaar, 'partial:' . $idempotencyKey, $returnUrl);

            return array_merge($result, [
                'remaining_balance_before_laar' => $remainingLaar,
                'remaining_balance_after_laar' => $remainingLaar - $amountLaar,
                'amount_laar' => $amountLaar,
            ]);
        });
    }

    /**
     * Re-check BML for a still-pending payment and confirm if the gateway says CONFIRMED.
     * Used when the customer was charged but return-URL / webhook never marked us paid
     * (common on TEST when the portal webhook points at production).
     *
     * Only confirms when the status API explicitly returns CONFIRMED — never trusts
     * the browser return URL alone. Idempotent.
     *
     * @return bool true if the order is (now) paid
     */
    public function reconcilePendingBmlPayment(Order $order): bool
    {
        $order->refresh();

        if ($this->orderLooksPaid($order)) {
            return true;
        }

        $payment = Payment::query()
            ->where('order_id', $order->id)
            ->whereNotNull('provider_transaction_id')
            ->whereIn('status', ['created', 'initiated', 'pending'])
            ->latest('id')
            ->first();

        if (!$payment) {
            return false;
        }

        $transactionId = (string) $payment->provider_transaction_id;

        try {
            $fetched = $this->bml->getTransactionStatus($transactionId);
        } catch (\Throwable $e) {
            Log::warning('BML reconcile: status API failed', [
                'order_id' => $order->id,
                'payment_id' => $payment->id,
                'transaction_id' => $transactionId,
                'error' => $e->getMessage(),
            ]);

            return false;
        }

        $apiState = strtoupper((string) ($fetched['state'] ?? $fetched['status'] ?? ''));
        if ($apiState !== 'CONFIRMED') {
            Log::info('BML reconcile: gateway not CONFIRMED yet', [
                'order_id' => $order->id,
                'payment_id' => $payment->id,
                'transaction_id' => $transactionId,
                'api_state' => $apiState !== '' ? $apiState : null,
            ]);

            return false;
        }

        Log::info('BML reconcile: confirming payment from gateway status', [
            'order_id' => $order->id,
            'payment_id' => $payment->id,
            'transaction_id' => $transactionId,
        ]);

        $this->confirmPayment($payment, array_merge($fetched, [
            'transactionId' => $transactionId,
            'localId' => $payment->local_id,
            'state' => 'CONFIRMED',
            'source' => 'status_poll_reconcile',
        ]));

        $order->refresh();

        return $this->orderLooksPaid($order);
    }

    private function orderLooksPaid(Order $order): bool
    {
        return $order->paid_at !== null
            || $order->payment_status === 'paid'
            || in_array($order->status, ['paid', 'completed'], true);
    }

    /**
     * Confirmation triggered from the BML return URL.
     *
     * SECURITY (2026-08 audit #2): the return URL is an UNAUTHENTICATED browser
     * redirect — its query params must never settle a payment on their own.
     * This method FAILS CLOSED: it only settles when BML's server-to-server
     * status API explicitly returns CONFIRMED for the exact stored payment.
     * If that API is unreachable, the payment stays pending and the signed
     * webhook (or a later reconcile) settles it. Idempotent.
     */
    public function confirmFromReturnUrl(int $orderId, string $transactionId): void
    {
        // Resolve strictly by the completed transaction id. Do NOT fall back to
        // "latest payment for this order" for confirmation — that could confirm
        // a different attempt than the one BML actually verified.
        $payment = $this->payments->findByProviderTransactionId($transactionId);

        if (!$payment || (int) $payment->order_id !== $orderId) {
            Log::info('BML return: no matching payment for transaction/order', [
                'order_id' => $orderId,
                'transaction_id' => $transactionId,
                'payment_found' => (bool) $payment,
            ]);

            return;
        }

        // Already settled (e.g. webhook arrived first) — nothing to do.
        if (in_array($payment->status, ['confirmed', 'paid', 'completed'], true)) {
            Log::info('BML return: payment already confirmed', ['payment_id' => $payment->id]);

            return;
        }

        // Fail CLOSED: an outage/timeout on the status API must NOT confirm.
        try {
            $fetched = $this->bml->getTransactionStatus($transactionId);
        } catch (\Throwable $e) {
            Log::warning('BML return: status API unavailable — leaving payment pending', [
                'transaction_id' => $transactionId,
                'order_id' => $orderId,
                'payment_id' => $payment->id,
                'error' => $e->getMessage(),
            ]);

            return;
        }

        $apiState = $fetched['state'] ?? $fetched['status'] ?? null;
        if ($apiState !== 'CONFIRMED') {
            Log::warning('BML return: status not CONFIRMED — not settling', [
                'transaction_id' => $transactionId,
                'api_state' => $apiState,
                'order_id' => $orderId,
                'payment_id' => $payment->id,
            ]);

            return;
        }

        // Defense in depth: returned identifiers and amount must match the
        // locally created payment before we mark it paid.
        $returnedTxn = (string) ($fetched['transactionId'] ?? $transactionId);
        if ($payment->provider_transaction_id && $returnedTxn !== $payment->provider_transaction_id) {
            Log::warning('BML return: transaction id mismatch — not settling', [
                'expected' => $payment->provider_transaction_id,
                'returned' => $returnedTxn,
                'payment_id' => $payment->id,
            ]);

            return;
        }

        $apiAmountLaar = isset($fetched['amount']) ? (int) $fetched['amount'] : null;
        if ($apiAmountLaar !== null && $payment->amount_laar !== null
            && $apiAmountLaar !== (int) $payment->amount_laar) {
            Log::warning('BML return: amount mismatch — not settling', [
                'expected_laar' => (int) $payment->amount_laar,
                'returned_laar' => $apiAmountLaar,
                'payment_id' => $payment->id,
            ]);

            return;
        }

        Log::info('BML return: confirming payment via verified status API', [
            'order_id' => $orderId,
            'transaction_id' => $returnedTxn,
            'payment_id' => $payment->id,
        ]);

        $this->confirmPayment($payment, array_merge($fetched, [
            'transactionId' => $returnedTxn,
            'localId' => $payment->local_id,
            'state' => 'CONFIRMED',
            'source' => 'return_url_verified',
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

        // FIX 12 — verify HMAC signature BEFORE minting a WebhookLog row.
        // The prior order (firstOrCreate → verify) let a forged webhook
        // claim the idempotency key for a genuine transactionId, so a
        // subsequent legitimate delivery would be dropped as a duplicate.
        // Now: bad signature → 401-style throw, no log row created.
        $signatureOk = $this->bml->verifyWebhookSignature($rawBody, $signature);
        if (!$signatureOk) {
            Log::warning('BML: Webhook signature mismatch. Verify BML_WEBHOOK_SECRET matches the portal.', [
                'idempotency_key' => $idempotencyKey,
            ]);

            if (
                config('app.env') === 'production'
                || config('bml.enforce_signature', true)
                || filled(config('bml.webhook_secret'))
            ) {
                throw new \RuntimeException('BML webhook signature verification failed — rejecting payload.');
            }
        }

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
                    'payment_id' => $payment->id,
                    'current_status' => $payment->status,
                    'webhook_state' => $state,
                ]);
            }

            $this->cancelOrderOnPaymentFailure($payment->order_id, $state);
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
                    'payment_id' => $payment->id,
                    'current_status' => $locked?->status ?? 'not found',
                ]);

                return;
            }

            // Advance status via state machine — single validated transition path.
            $sm->transition('confirmed', ['gateway_response' => $payload]);

            $locked->refresh();
            $this->paymentCommission->applyToPayment($locked);

            $this->attributeGatewayPaymentToOpenShift($locked);

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
            $paidLaar = $this->payments->sumAmountLaarForOrder($order->id, ['paid', 'confirmed', 'completed']);
            $orderLaar = $this->orderTotalLaar($order);

            // Soft-held gift-card tender covers part of the grand total.
            $giftTenderLaar = max(0, (int) ($order->gift_card_discount_laar ?? 0));
            if ($giftTenderLaar > 0) {
                $giftPaidLaar = (int) Payment::query()
                    ->where('order_id', $order->id)
                    ->where('method', 'gift_card')
                    ->whereIn('status', ['paid', 'confirmed', 'completed'])
                    ->selectRaw('SUM(COALESCE(amount_laar, ROUND(amount * 100))) as t')
                    ->value('t');
                if ($giftPaidLaar <= 0) {
                    $paidLaar += $giftTenderLaar;
                }
            }

            Log::info('BML: Payment confirmed', [
                'payment_id' => $locked->id,
                'order_id' => $order->id,
                'paid_laar' => $paidLaar,
                'order_laar' => $orderLaar,
            ]);

            PaymentConfirmed::dispatch(PaymentConfirmedData::fromPaymentAndOrder($locked, $order));

            if ($giftTenderLaar > 0) {
                $hasGiftPayment = Payment::query()
                    ->where('order_id', $order->id)
                    ->where('method', 'gift_card')
                    ->whereIn('status', ['paid', 'confirmed', 'completed'])
                    ->exists();
                if (!$hasGiftPayment) {
                    Payment::create([
                        'order_id' => $order->id,
                        'method' => 'gift_card',
                        'amount' => round($giftTenderLaar / 100, 2),
                        'amount_laar' => $giftTenderLaar,
                        'status' => 'paid',
                        'processed_at' => now(),
                        'idempotency_key' => 'gift_card:tender:' . $order->id,
                    ]);
                }
            }

            app(GiftCardRedemptionService::class)->redeemForOrder($order);

            // Always mirror partial/full financial state for pay-link flows.
            $this->paymentState->syncPaymentStatus($order->fresh());

            if ($paidLaar >= $orderLaar && !in_array($order->status, ['paid', 'completed'], true)) {
                // Online orders held at payment_pending: move to pending so KDS/kitchen can see them.
                // POS orders already in the kitchen queue go straight to paid.
                // Gift-card purchases skip the kitchen queue and complete after issue.
                // Either way the financial state is fully paid — mirror it into
                // `payment_status` so the POS "Send pay link" / UNPAID badge
                // logic flips off the moment BML confirms.
                $newStatus = match (true) {
                    $order->type === 'gift_card' => 'paid',
                    $order->status === 'payment_pending' => 'pending',
                    default => 'paid',
                };
                $this->orders->updateStatus($order->id, $newStatus, [
                    'paid_at' => now(),
                    'payment_status' => 'paid',
                ]);

                DB::afterCommit(function () use ($order): void {
                    $freshOrder = $this->orders->findById($order->id);
                    if (!$freshOrder) {
                        return;
                    }

                    if ($freshOrder->type !== 'gift_card') {
                        try {
                            // Send confirmation SMS/email synchronously — no queue dependency.
                            $this->confirmationNotifier->notify($freshOrder);
                        } catch (\Throwable $e) {
                            Log::error('BML confirmPayment: payment confirmation notify failed', [
                                'order_id' => $freshOrder->id,
                                'error' => $e->getMessage(),
                            ]);
                        }
                    }

                    // OrderPaid triggers SendPaymentConfirmationListener as a sync retry fallback.
                    // For gift_card purchases it also issues + delivers the code.
                    OrderPaid::dispatch(OrderPaidData::fromOrder($freshOrder, true));
                });
            }
        });
    }

    /**
     * Tag gateway payments to the sole open shift so shift summary reflects
     * online BML sales the cashier can see on the POS header.
     */
    private function attributeGatewayPaymentToOpenShift(Payment $payment): void
    {
        if ($payment->shift_id !== null) {
            return;
        }

        $gatewayMethods = ['bml_connect', 'bml_pay', 'bml', 'online', 'stripe'];
        if (!in_array($payment->method, $gatewayMethods, true)) {
            return;
        }

        $openShiftIds = Shift::query()->whereNull('closed_at')->pluck('id');
        if ($openShiftIds->count() !== 1) {
            return;
        }

        $payment->update(['shift_id' => $openShiftIds->first()]);
    }

    /**
     * Cancel an order that is stuck at payment_pending after a failed/expired payment.
     *
     * Dispatches OrderCancelled so reservation listeners (stock, promo, loyalty) fire.
     * Row-locked to prevent race with CancelStaleOrders cron.
     */
    private function cancelOrderOnPaymentFailure(int $orderId, string $paymentState): void
    {
        DB::transaction(function () use ($orderId, $paymentState): void {
            $order = Order::lockForUpdate()->find($orderId);

            if (!$order || $order->status !== 'payment_pending') {
                return; // Already cancelled or progressed — nothing to do
            }

            $this->orders->updateStatus($order->id, 'cancelled');

            Log::info('BML: Order cancelled due to payment failure', [
                'order_id' => $order->id,
                'order_number' => $order->order_number,
                'payment_state' => $paymentState,
            ]);

            DB::afterCommit(function () use ($order): void {
                try {
                    OrderCancelled::dispatch(OrderCancelledData::fromOrder($order));
                } catch (\Throwable $e) {
                    Log::error('cancelOrderOnPaymentFailure: post-commit dispatch failed', [
                        'order_id' => $order->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            });
        });
    }

    /**
     * Finalize an online customer order when nothing is owed (gift card / discounts cover 100%).
     * Skips BML; fires the same OrderPaid path as a confirmed card payment.
     *
     * @throws \InvalidArgumentException When the order is not eligible
     */
    public function completeZeroBalanceOnlineOrder(int $orderId, int $customerId): Order
    {
        return DB::transaction(function () use ($orderId, $customerId): Order {
            $locked = Order::where('id', $orderId)->lockForUpdate()->firstOrFail();

            if ((int) $locked->customer_id !== $customerId) {
                throw new \InvalidArgumentException('Not your order.');
            }

            // Remaining after soft-held gift-card tender (and any payments).
            $remainingLaar = $this->getRemainingBalanceLaar($locked);
            if ($remainingLaar > 0) {
                throw new \InvalidArgumentException('Order still has an amount due. Pay with card.');
            }

            if (in_array($locked->status, ['paid', 'completed', 'cancelled'], true)) {
                throw new \InvalidArgumentException('Order already finalized.');
            }

            $giftTenderLaar = max(0, (int) ($locked->gift_card_discount_laar ?? 0));
            if ($giftTenderLaar > 0) {
                $hasGiftPayment = Payment::query()
                    ->where('order_id', $locked->id)
                    ->where('method', 'gift_card')
                    ->whereIn('status', ['paid', 'completed', 'confirmed'])
                    ->exists();
                if (!$hasGiftPayment) {
                    Payment::create([
                        'order_id' => $locked->id,
                        'method' => 'gift_card',
                        'amount' => round($giftTenderLaar / 100, 2),
                        'amount_laar' => $giftTenderLaar,
                        'status' => 'paid',
                        'processed_at' => now(),
                        'idempotency_key' => 'gift_card:tender:' . $locked->id,
                    ]);
                }
            }

            app(GiftCardRedemptionService::class)->redeemForOrder($locked);

            $online = in_array($locked->type, ['online_pickup', 'delivery'], true);
            $newStatus = ($online && in_array($locked->status, ['pending', 'payment_pending'], true))
                ? 'pending'
                : ($locked->status === 'payment_pending' ? 'pending' : 'paid');

            // Zero-balance order (covered by discounts / gift card / loyalty);
            // mark fully paid in payment_status too so it stops showing UNPAID
            // in Open Tickets the moment the cashier confirms.
            $this->orders->updateStatus($locked->id, $newStatus, [
                'paid_at' => now(),
                'payment_status' => 'paid',
            ]);

            $dispatchId = $locked->id;
            DB::afterCommit(function () use ($dispatchId): void {
                try {
                    $fresh = $this->orders->findById($dispatchId);
                    if ($fresh) {
                        $this->confirmationNotifier->notify($fresh);
                        OrderPaid::dispatch(OrderPaidData::fromOrder($fresh, true));
                    }
                } catch (\Throwable $e) {
                    Log::error('completeZeroBalance: post-commit notification failed', [
                        'order_id' => $dispatchId,
                        'error' => $e->getMessage(),
                    ]);
                }
            });

            return $this->orders->findById($locked->id) ?? $locked;
        });
    }

    /** Prefer persisted laari total; fall back to decimal MVR only for legacy rows. */
    private function orderTotalLaar(Order $order): int
    {
        if ($order->total_laar !== null) {
            return (int) $order->total_laar;
        }

        return LaariConverter::toLaar($order->total);
    }
}
