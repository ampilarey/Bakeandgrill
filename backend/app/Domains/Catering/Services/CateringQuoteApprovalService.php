<?php

declare(strict_types=1);

namespace App\Domains\Catering\Services;

use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Domains\Orders\Events\OrderCancelled;
use App\Domains\Orders\Services\OrderCreationService;
use App\Domains\Payments\Services\PaymentService;
use App\Models\CateringRequest;
use App\Models\Order;
use App\Models\Payment;
use App\Services\OrderStatusTransitionService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CateringQuoteApprovalService
{
    public function __construct(
        private readonly OrderCreationService $orders,
        private readonly PaymentService $payments,
        private readonly OrderStatusTransitionService $transitions,
    ) {}

    /**
     * @return array{request: CateringRequest, order: Order, payment_url: string, payment_id: int}
     */
    public function approve(string $token): array
    {
        return DB::transaction(function () use ($token) {
            /** @var CateringRequest|null $request */
            $request = CateringRequest::query()
                ->where('quote_token', $token)
                ->lockForUpdate()
                ->first();

            if (!$request) {
                abort(404, 'Quote not found.');
            }

            if ($request->quote_expires_at && $request->quote_expires_at->isPast()) {
                abort(410, 'This quote has expired.');
            }

            if ($request->status !== 'awaiting_customer') {
                throw ValidationException::withMessages([
                    'status' => ['This quote is not awaiting customer approval.'],
                ]);
            }

            // Idempotent re-approve while payment still pending.
            if ($request->pos_order_id) {
                $existing = Order::query()->lockForUpdate()->find($request->pos_order_id);
                if ($existing && $existing->status === 'payment_pending' && $existing->type === 'catering') {
                    $amountLaar = (int) $request->quote_payment_laar;
                    if ($amountLaar <= 0) {
                        throw ValidationException::withMessages([
                            'quote_payment_laar' => ['Quote payment amount is missing.'],
                        ]);
                    }

                    $payment = Payment::query()
                        ->where('order_id', $existing->id)
                        ->where('status', 'initiated')
                        ->whereNotNull('provider_transaction_id')
                        ->orderByDesc('id')
                        ->first();

                    if ($payment) {
                        $baseUrl = rtrim((string) config('bml.base_url', 'https://api.merchants.bankofmaldives.com.mv'), '/');
                        $payUrl = "{$baseUrl}/pay/{$payment->provider_transaction_id}";

                        return [
                            'request' => $request->fresh(['lines']),
                            'order' => $existing,
                            'payment_url' => $payUrl,
                            'payment_id' => (int) $payment->id,
                        ];
                    }

                    $idempotency = 'bml:event:' . $request->id . ':v' . $request->quote_version;
                    $result = $this->payments->initiateBmlPayment($existing, $amountLaar, $idempotency);

                    return [
                        'request' => $request->fresh(['lines']),
                        'order' => $existing,
                        'payment_url' => $result['payment_url'],
                        'payment_id' => (int) $result['payment_id'],
                    ];
                }
            }

            $request->load('lines');
            $order = $this->orders->createFromCateringQuote($request);

            $amountLaar = (int) $request->quote_payment_laar;
            if ($amountLaar <= 0) {
                throw ValidationException::withMessages([
                    'quote_payment_laar' => ['Quote payment amount is missing.'],
                ]);
            }

            $idempotency = 'bml:event:' . $request->id . ':v' . $request->quote_version;
            $result = $this->payments->initiateBmlPayment($order, $amountLaar, $idempotency);

            $request->update([
                'pos_order_id' => $order->id,
                // Stay awaiting_customer until payment confirms.
                'status' => 'awaiting_customer',
            ]);

            return [
                'request' => $request->fresh(['lines']),
                'order' => $order,
                'payment_url' => $result['payment_url'],
                'payment_id' => (int) $result['payment_id'],
            ];
        });
    }

    /**
     * Cancel a stale payment_pending catering order linked to this request (e.g. before resend).
     */
    public function cancelPendingOrderIfAny(CateringRequest $request): void
    {
        if (!$request->pos_order_id) {
            return;
        }

        $order = Order::query()->find($request->pos_order_id);
        if (!$order || $order->type !== 'catering' || $order->status !== 'payment_pending') {
            return;
        }

        DB::transaction(function () use ($order, $request) {
            $locked = Order::query()->lockForUpdate()->find($order->id);
            if (!$locked || $locked->status !== 'payment_pending') {
                return;
            }
            $this->transitions->transition($locked, 'cancelled');
            $request->update(['pos_order_id' => null]);
            DB::afterCommit(function () use ($locked) {
                OrderCancelled::dispatch(OrderCancelledData::fromOrder($locked->fresh()));
            });
        });
    }

    public function hasLivePendingPaymentOrder(CateringRequest $request): bool
    {
        if (!$request->pos_order_id) {
            return false;
        }
        $order = Order::query()->find($request->pos_order_id);

        return $order
            && $order->type === 'catering'
            && $order->status === 'payment_pending';
    }
}
