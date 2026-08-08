<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Finance\Services\RefundWorkflowService;
use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Domains\Orders\Events\OrderCancelled;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Refund;
use App\Services\AuditLogService;
use App\Services\OrderStatusMachine;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Customer self-cancel for own unstarted orders (order app).
 *
 * Kitchen-not-started = same signals as KDS hold: fired_at is still null
 * and status is still pre-preparation. Once fired or cooking/delivery
 * starts, the customer must contact the restaurant.
 */
class CustomerOrderCancellationService
{
    /** Statuses where the kitchen / rider chain has clearly started. */
    private const KITCHEN_STARTED_STATUSES = [
        'in_progress',
        'ready',
        'out_for_delivery',
        'picked_up',
        'on_the_way',
        'delivered',
        'completed',
        'partial',
        'partially_refunded',
        'cancelled',
        'refunded',
    ];

    /** Pre-preparation statuses eligible for self-cancel (when unfired). */
    private const PRE_PREPARATION_STATUSES = [
        'payment_pending',
        'pending',
        'paid',
        'held',
    ];

    public function __construct(
        private readonly RefundWorkflowService $refunds,
        private readonly OrderStatusMachine $statusMachine,
    ) {}

    public function customerCanSelfCancel(Order $order): bool
    {
        if (! in_array($order->status, self::PRE_PREPARATION_STATUSES, true)) {
            return false;
        }

        if (in_array($order->status, self::KITCHEN_STARTED_STATUSES, true)) {
            return false;
        }

        // Fired tickets are on (or leaving) the KDS hold — kitchen has them.
        if ($order->fired_at !== null) {
            return false;
        }

        return true;
    }

    /**
     * @return array{order: Order, refund: ?Refund, refunded: bool}
     */
    public function cancel(Customer $customer, Order $order, ?Request $request = null): array
    {
        if ((int) $order->customer_id !== (int) $customer->id) {
            abort(403, 'You can only cancel your own orders.');
        }

        if (in_array($order->status, ['cancelled', 'refunded'], true)) {
            return [
                'order' => $order->fresh(['items', 'payments', 'reservation.table']),
                'refund' => $order->refunds()->latest('id')->first(),
                'refunded' => $order->status === 'refunded',
            ];
        }

        if (! $this->customerCanSelfCancel($order)) {
            abort(422, 'This order can no longer be cancelled online. Please contact the restaurant.');
        }

        $order->loadMissing(['payments', 'customer']);

        if ($this->orderHasRecordedPayment($order)) {
            $result = $this->refunds->refundFullyForCustomerSelfCancel($order, $customer, $request);

            return [
                'order' => $result['order']->load(['items', 'payments', 'reservation.table']),
                'refund' => $result['refund'],
                'refunded' => true,
            ];
        }

        $cancelled = $this->cancelUnpaid($order, $customer, $request);

        return [
            'order' => $cancelled->load(['items', 'payments', 'reservation.table']),
            'refund' => null,
            'refunded' => false,
        ];
    }

    private function orderHasRecordedPayment(Order $order): bool
    {
        if (in_array($order->payment_status, ['paid', 'partial'], true)) {
            return true;
        }

        return $order->payments()
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->exists();
    }

    private function cancelUnpaid(Order $order, Customer $customer, ?Request $request): Order
    {
        return DB::transaction(function () use ($order, $customer, $request) {
            $locked = Order::lockForUpdate()->findOrFail($order->id);

            if ((int) $locked->customer_id !== (int) $customer->id) {
                abort(403, 'You can only cancel your own orders.');
            }

            if ($locked->status === 'cancelled') {
                return $locked;
            }

            if (! $this->customerCanSelfCancel($locked)) {
                abort(422, 'This order can no longer be cancelled online. Please contact the restaurant.');
            }

            if ($this->orderHasRecordedPayment($locked)) {
                abort(422, 'This order has a payment recorded — use the refund path.');
            }

            if (! $this->statusMachine->isAllowed($locked->status, 'cancelled')) {
                abort(422, "Order is {$locked->status} and can't be cancelled.");
            }

            $locked->update([
                'status' => 'cancelled',
                'cancellation_reason' => 'Customer cancelled before kitchen started',
                'cancelled_at' => now(),
                'cancelled_by' => null,
            ]);

            app(AuditLogService::class)->log(
                'customer.order.cancelled',
                'Order',
                $locked->id,
                [],
                [
                    'status' => 'cancelled',
                    'customer_id' => $customer->id,
                    'reason' => 'Customer cancelled before kitchen started',
                ],
                ['order_id' => $locked->id, 'customer_id' => $customer->id],
                $request,
            );

            DB::afterCommit(function () use ($locked): void {
                OrderCancelled::dispatch(OrderCancelledData::fromOrder($locked->fresh()));
            });

            return $locked->fresh();
        });
    }
}
