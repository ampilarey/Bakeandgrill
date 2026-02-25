<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Payments\Gateway\BmlConnectService;
use App\Models\Order;
use App\Models\Payment;
use App\Models\WebhookLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class PaymentService
{
    public function __construct(private BmlConnectService $bml) {}

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

        $payment = DB::transaction(function () use ($order, $idempotencyKey, $localId, $amountLaar): Payment {
            return Payment::firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'order_id' => $order->id,
                    'method' => 'bml_connect',
                    'gateway' => 'bml',
                    'currency' => 'MVR',
                    'amount' => round($amountLaar / 100, 2),
                    'amount_laar' => $amountLaar,
                    'local_id' => $localId,
                    'status' => 'created',
                    'processed_at' => now(),
                ],
            );
        });

        // If the same idempotency_key already has an initiated/confirmed payment, return existing
        if ($payment->status === 'initiated') {
            return [
                'payment_url' => null,
                'payment_id' => $payment->id,
                'local_id' => $payment->local_id,
                'reused' => true,
            ];
        }

        if (!in_array($payment->status, ['created'], true)) {
            throw new \RuntimeException("Payment {$payment->id} already in state: {$payment->status}");
        }

        $result = $this->bml->createPayment(
            $payment->amount_laar,
            $localId,
        );

        $payment->update([
            'provider_transaction_id' => $result['transaction_id'],
            'status' => 'initiated',
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
     * Considers confirmed, paid, and completed payments.
     */
    public function getRemainingBalanceLaar(Order $order): int
    {
        $paidLaar = $order->payments()
            ->whereIn('status', ['confirmed', 'paid', 'completed'])
            ->sum('amount_laar');

        $orderTotalLaar = $order->total_laar ?? (int) round($order->total * 100);

        return max(0, $orderTotalLaar - $paidLaar);
    }

    /**
     * Initiate a partial BML payment.
     *
     * Rules:
     * - amount must be > 0 and <= remaining_balance
     * - idempotency_key is caller-supplied (required)
     * - Existing pending payment with same idempotency_key is returned as-is
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
     * Handle incoming BML webhook.
     *
     * Idempotent: protected by unique idempotency_key on webhook_logs.
     * NEVER fails a confirmed payment — always store first, process second.
     */
    public function handleBmlWebhook(string $rawBody, array $headers): void
    {
        $payload = json_decode($rawBody, true) ?? [];
        $signature = $headers['x-signature'] ?? $headers['X-Signature'] ?? '';

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

        if (!$this->bml->verifyWebhookSignature($rawBody, $signature)) {
            $log->update(['status' => 'rejected', 'error_message' => 'Invalid signature']);
            Log::warning('BML: Webhook signature invalid', ['idempotency_key' => $idempotencyKey]);

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

        $payment = Payment::where('local_id', $localId)->first();
        if (!$payment) {
            Log::warning('BML: No payment found for localId', ['local_id' => $localId]);

            return;
        }

        match ($state) {
            'CONFIRMED' => $this->confirmPayment($payment, $payload),
            'FAILED' => $payment->update(['status' => 'failed', 'gateway_response' => $payload]),
            'CANCELLED' => $payment->update(['status' => 'cancelled', 'gateway_response' => $payload]),
            'EXPIRED' => $payment->update(['status' => 'expired', 'gateway_response' => $payload]),
            default => Log::info('BML: Unknown state', ['state' => $state]),
        };
    }

    private function confirmPayment(Payment $payment, array $payload): void
    {
        if ($payment->status === 'confirmed') {
            Log::info('BML: Payment already confirmed, skipping', ['payment_id' => $payment->id]);

            return;
        }

        DB::transaction(function () use ($payment, $payload): void {
            $payment->update([
                'status' => 'confirmed',
                'gateway_response' => $payload,
            ]);

            $order = $payment->order;
            $paidTotal = $order->payments()
                ->whereIn('status', ['paid', 'confirmed', 'completed'])
                ->sum('amount');

            Log::info('BML: Payment confirmed', [
                'payment_id' => $payment->id,
                'order_id' => $order->id,
                'paid_total' => $paidTotal,
                'order_total' => $order->total,
            ]);

            PaymentConfirmed::dispatch($payment, $order);

            if ($paidTotal >= $order->total && !in_array($order->status, ['paid', 'completed'], true)) {
                $order->update(['status' => 'paid', 'paid_at' => now()]);

                DB::afterCommit(function () use ($order): void {
                    OrderPaid::dispatch($order->fresh(['items.modifiers', 'payments']), true);
                });
            }
        });
    }
}
