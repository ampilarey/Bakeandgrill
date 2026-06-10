<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Shift;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Settles a single offline-synced payment on an order. Extracted from
 * OrderPaymentController::addPayments for cash / card / bank_transfer only.
 */
class OrderOfflineSettlementService
{
    private const NON_SHIFT_METHODS = ['house_account', 'bml_pay', 'bml', 'online'];

    public function __construct(
        private AuditLogService $audit,
        private OrderStatusMachine $machine,
    ) {}

    /**
     * @param array{method: string, amount: float|int|string, reference_number?: ?string, idempotency_key?: ?string} $paymentPayload
     * @return array{0: Order, 1: float}
     */
    public function settle(
        Order $order,
        User $collector,
        Shift $shift,
        array $paymentPayload,
        bool $printReceipt = true,
        ?Request $request = null,
    ): array {
        return DB::transaction(function () use ($order, $collector, $shift, $paymentPayload, $printReceipt, $request): array {
            $order = Order::with('payments')->lockForUpdate()->findOrFail($order->id);

            $terminalStatuses = ['cancelled', 'refunded', 'paid', 'completed'];
            if (in_array($order->status, $terminalStatuses, true)) {
                abort(422, "Cannot add payments to a {$order->status} order.");
            }

            if ($order->status === 'held') {
                $this->machine->assertTransitionAllowed($order, 'pending');
                $order->update(['status' => 'pending', 'held_at' => null]);
                $order->refresh();
            }

            $payKey = $paymentPayload['idempotency_key'] ?? null;
            if ($payKey) {
                $existing = Payment::where('idempotency_key', $payKey)->first();
                if ($existing !== null) {
                    $paidTotalLaar = (int) $order->payments()
                        ->whereIn('status', ['paid', 'completed', 'confirmed'])
                        ->selectRaw('COALESCE(SUM(amount_laar), SUM(ROUND(amount * 100))) as total_laar')
                        ->value('total_laar');

                    return [$order->fresh('payments'), round($paidTotalLaar / 100, 2)];
                }
            }

            $amountLaar = (int) round((float) $paymentPayload['amount'] * 100);
            $method = (string) $paymentPayload['method'];

            $linksShift = !in_array($method, self::NON_SHIFT_METHODS, true);

            $payment = Payment::create([
                'idempotency_key' => $payKey,
                'order_id' => $order->id,
                'method' => $method,
                'amount' => $paymentPayload['amount'],
                'amount_laar' => $amountLaar,
                'status' => 'paid',
                'reference_number' => $paymentPayload['reference_number'] ?? null,
                'processed_at' => now(),
                'collected_by_user_id' => $collector->id,
                'shift_id' => $linksShift ? $shift->id : null,
            ]);

            app(\App\Domains\Payments\Services\PaymentCommissionService::class)->applyToPayment($payment);

            $oldStatus = $order->status;

            $paidTotalLaar = (int) $order->payments()
                ->whereIn('status', ['paid', 'completed', 'confirmed'])
                ->selectRaw('COALESCE(SUM(amount_laar), SUM(ROUND(amount * 100))) as total_laar')
                ->value('total_laar');

            $orderTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));
            $paidTotal = round($paidTotalLaar / 100, 2);

            if ($paidTotalLaar >= $orderTotalLaar) {
                $order->update([
                    'status' => 'paid',
                    'paid_at' => now(),
                    'payment_status' => 'paid',
                ]);

                $this->audit->log(
                    'order.paid',
                    'Order',
                    $order->id,
                    ['status' => $oldStatus],
                    ['status' => 'paid'],
                    ['paid_total' => $paidTotal, 'source' => 'offline_sync'],
                    $request,
                );

                DB::afterCommit(function () use ($order, $printReceipt): void {
                    DeferAfterResponse::run(function () use ($order, $printReceipt): void {
                        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), $printReceipt));
                    }, 'OrderPaid');
                });
            } else {
                $order->update([
                    'status' => 'partial',
                    'payment_status' => 'partial',
                ]);

                $this->audit->log(
                    'order.partial',
                    'Order',
                    $order->id,
                    ['status' => $oldStatus],
                    ['status' => 'partial'],
                    ['paid_total' => $paidTotal, 'source' => 'offline_sync'],
                    $request,
                );
            }

            return [$order->fresh('payments'), $paidTotal];
        });
    }
}
