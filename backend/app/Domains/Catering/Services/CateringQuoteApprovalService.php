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

                    // Same guard on the resume path — the order total here was
                    // stamped at first approval, so a quote that already
                    // disagreed with it must not be paid on a retry either.
                    $this->assertQuotedAmountStillMatchesOrder($request, $existing, $amountLaar);

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

            $this->assertQuotedAmountStillMatchesOrder($request, $order, $amountLaar);

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
     * The quote was priced when it was sent; the order is built when the
     * customer approves, which can be days later and uses *live* GST settings.
     * Line prices are frozen on the quote, so the drift is settings — the GST
     * rate, tax-inclusive mode, or whether a fee is taxable.
     *
     * If they moved, the customer is about to be charged a figure that no
     * longer matches the order, and `ConfirmCateringEventOnPaymentListener`
     * confirms on coverage of the quoted amount rather than the order total —
     * so the event would go ahead with a residual balance or an overpayment
     * that nobody chose. Fail closed and make somebody re-quote.
     *
     * A deposit is only checked for not exceeding the total: taking part of a
     * larger bill is the whole point, and the rest is collected later.
     */
    private function assertQuotedAmountStillMatchesOrder(
        CateringRequest $request,
        Order $order,
        int $amountLaar,
    ): void {
        $orderTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
        if ($orderTotalLaar <= 0) {
            return;
        }

        $isDeposit = (bool) $request->quote_is_deposit;

        if ($isDeposit) {
            if ($amountLaar > $orderTotalLaar) {
                throw ValidationException::withMessages([
                    'quote_payment_laar' => [
                        'This quote is out of date — the deposit is now more than the order total. Please ask us to re-send it.',
                    ],
                ]);
            }

            return;
        }

        if ($amountLaar !== $orderTotalLaar) {
            throw ValidationException::withMessages([
                'quote_payment_laar' => [
                    'This quote is out of date — prices or tax changed since it was sent. Please ask us to re-send it.',
                ],
            ]);
        }
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
