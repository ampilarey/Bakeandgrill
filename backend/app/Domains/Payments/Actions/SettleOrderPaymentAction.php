<?php

declare(strict_types=1);

namespace App\Domains\Payments\Actions;

use App\Domains\Customers\Services\CustomerCreditService;
use App\Domains\Deposits\Services\CustomerDepositService;
use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Payments\Services\PaymentAllocationService;
use App\Domains\Payments\Services\PaymentCommissionService;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Shift;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\OrderStatusTransitionService;
use App\Services\PermissionService;
use App\Support\DeferAfterResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class SettleOrderPaymentAction
{
    public function __construct(
        private readonly PaymentAllocationService $allocation,
        private readonly CustomerCreditService $creditService,
        private readonly CustomerDepositService $depositService,
        private readonly PermissionService $permissions,
        private readonly OrderStatusTransitionService $statusTransitions,
        private readonly PaymentCommissionService $commission,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @param array{payments: list<array<string, mixed>>, print_receipt?: bool} $validated
     * @return array{0: Order, 1: float}
     */
    public function execute(
        int $orderId,
        array $validated,
        User $collector,
        ?Shift $collectorShift,
        Request $request,
        bool $printReceipt,
    ): array {
        $nonShiftMethods = $this->allocation->nonShiftMethods();
        $gatewayMethods = PaymentAllocationService::GATEWAY_METHODS;

        return DB::transaction(function () use ($orderId, $validated, $collector, $collectorShift, $request, $printReceipt, $nonShiftMethods, $gatewayMethods): array {
            $order = Order::with('payments')->lockForUpdate()->findOrFail($orderId);
            $paymentRows = $validated['payments'];

            // Defense in depth: gift_card rows are created only via the
            // soft-hold firstOrCreate below. Client POSTs must never mint them
            // (would mark the order paid without debiting a card).
            foreach ($paymentRows as $row) {
                if (($row['method'] ?? '') === 'gift_card') {
                    abort(422, 'gift_card is not a client-postable method');
                }
            }

            $allIdempotentReplay = count($paymentRows) > 0 && collect($paymentRows)->every(function (array $row): bool {
                $key = $row['idempotency_key'] ?? null;

                return is_string($key) && $key !== '' && Payment::where('idempotency_key', $key)->exists();
            });

            if ($allIdempotentReplay) {
                $paidTotalLaar = (int) $order->payments()
                    ->whereIn('status', ['paid', 'completed', 'confirmed'])
                    ->selectRaw('SUM(COALESCE(amount_laar, ROUND(amount * 100))) as total_laar')
                    ->value('total_laar');

                return [$order, round($paidTotalLaar / 100, 2)];
            }

            $terminalStatuses = ['cancelled', 'refunded', 'paid', 'completed'];
            if (in_array($order->status, $terminalStatuses, true)) {
                abort(422, "Cannot add payments to a {$order->status} order.");
            }

            $accounts = $this->allocation->resolveAccountCustomers(
                $order,
                $paymentRows,
                $collector,
                $this->creditService,
                $this->depositService,
                $this->permissions,
            );
            $this->allocation->assertTenderPermissions($collector, $paymentRows, $this->permissions);

            if ($order->status === 'held') {
                $this->statusTransitions->transition($order, 'pending', ['held_at' => null]);
                $order->refresh();
            }

            // Soft-held gift-card tender → payment row so remaining cash/card
            // only needs to cover order.total − gift tender.
            $giftTenderLaar = max(0, (int) ($order->gift_card_discount_laar ?? 0));
            if ($giftTenderLaar > 0) {
                $hasGiftPayment = Payment::query()
                    ->where('order_id', $order->id)
                    ->where('method', 'gift_card')
                    ->whereIn('status', ['paid', 'completed', 'confirmed'])
                    ->exists();
                if (!$hasGiftPayment) {
                    Payment::firstOrCreate(
                        ['idempotency_key' => 'gift_card:tender:' . $order->id],
                        [
                            'order_id' => $order->id,
                            'method' => 'gift_card',
                            'amount' => round($giftTenderLaar / 100, 2),
                            'amount_laar' => $giftTenderLaar,
                            'status' => 'paid',
                            'processed_at' => now(),
                            'collected_by_user_id' => $collector->id,
                            'shift_id' => null,
                        ],
                    );
                }
            }

            $this->allocation->assertTenderCap($order->fresh('payments'), $paymentRows);

            $oldStatus = $order->status;

            foreach ($paymentRows as $paymentPayload) {
                if (!empty($paymentPayload['idempotency_key'])) {
                    $existingPayment = Payment::where('idempotency_key', $paymentPayload['idempotency_key'])->first();
                    if ($existingPayment !== null) {
                        continue;
                    }
                }

                $paymentStatus = in_array($paymentPayload['method'], $gatewayMethods, true) ? 'pending' : 'paid';
                $amountLaar = (int) round((float) $paymentPayload['amount'] * 100);

                // FIX 11 — record cash tendered_amount + derived change_given
                // only when the client supplied it AND we're settling cash.
                // Drawer expected-cash still uses `amount`, so overpay never
                // leaves phantom money in the till. Older clients that
                // simply omit `tendered_amount` continue to work.
                $tenderedAmount = null;
                $changeGiven = null;
                if (
                    $paymentPayload['method'] === 'cash'
                    && array_key_exists('tendered_amount', $paymentPayload)
                    && $paymentPayload['tendered_amount'] !== null
                    && $paymentPayload['tendered_amount'] !== ''
                ) {
                    $tenderedAmount = round((float) $paymentPayload['tendered_amount'], 2);
                    $changeGiven = max(0.0, round($tenderedAmount - (float) $paymentPayload['amount'], 2));
                }

                $payment = Payment::create([
                    'order_id' => $order->id,
                    'method' => $paymentPayload['method'],
                    'amount' => $paymentPayload['amount'],
                    'tendered_amount' => $tenderedAmount,
                    'change_given' => $changeGiven,
                    'amount_laar' => $amountLaar,
                    'status' => $paymentStatus,
                    'reference_number' => $paymentPayload['reference_number'] ?? null,
                    'idempotency_key' => $paymentPayload['idempotency_key'] ?? null,
                    'processed_at' => now(),
                    'collected_by_user_id' => $collector->id,
                    'shift_id' => in_array($paymentPayload['method'], $nonShiftMethods, true)
                        ? null
                        : $collectorShift?->id,
                ]);

                if ($paymentPayload['method'] === 'house_account' && $accounts['credit'] !== null) {
                    $this->creditService->recordCharge($accounts['credit'], $order, $payment, $collector, $request);
                }

                if (in_array($paymentPayload['method'], ['wallet', 'customer_deposit'], true) && $accounts['deposit'] !== null) {
                    $this->depositService->recordUsage($accounts['deposit'], $order, $payment, $collector, $request);
                }

                if ($paymentStatus === 'paid') {
                    $this->commission->applyToPayment($payment);
                }

                $this->audit->log('payment.created', 'Payment', $payment->id, [], $payment->toArray(), ['order_id' => $order->id], $request);
            }

            $paidTotalLaar = (int) $order->payments()
                ->whereIn('status', ['paid', 'completed', 'confirmed'])
                ->selectRaw('SUM(COALESCE(amount_laar, ROUND(amount * 100))) as total_laar')
                ->value('total_laar');

            $orderTotalLaar = $order->total_laar ?? (int) round($order->total * 100);
            $paidTotal = round($paidTotalLaar / 100, 2);

            if ($paidTotalLaar >= $orderTotalLaar) {
                $this->statusTransitions->transition($order, 'paid', [
                    'paid_at' => now(),
                    'payment_status' => 'paid',
                ]);

                $this->audit->log('order.paid', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'paid'], ['paid_total' => $paidTotal], $request);

                DB::afterCommit(function () use ($order, $printReceipt): void {
                    DeferAfterResponse::run(function () use ($order, $printReceipt): void {
                        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), $printReceipt));
                    }, 'OrderPaid');
                });
            } else {
                $this->statusTransitions->transition($order, 'partial', [
                    'payment_status' => 'partial',
                ]);

                $this->audit->log('order.partial', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'partial'], ['paid_total' => $paidTotal], $request);
            }

            // Keep the Send Bill public invoice in sync with cash/card settlement.
            app(\App\Http\Controllers\Api\InvoiceController::class)
                ->syncPaymentStateFromOrder($order->fresh('payments'));

            return [$order, $paidTotal];
        });
    }
}
