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
use App\Services\OrderStatusMachine;
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
        private readonly OrderStatusMachine $statusMachine,
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

            $allIdempotentReplay = count($paymentRows) > 0 && collect($paymentRows)->every(function (array $row): bool {
                $key = $row['idempotency_key'] ?? null;

                return is_string($key) && $key !== '' && Payment::where('idempotency_key', $key)->exists();
            });

            if ($allIdempotentReplay) {
                $paidTotalLaar = (int) $order->payments()
                    ->whereIn('status', ['paid', 'completed', 'confirmed'])
                    ->selectRaw('COALESCE(SUM(amount_laar), SUM(ROUND(amount * 100))) as total_laar')
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
                $this->statusMachine->assertTransitionAllowed($order, 'pending');
                $order->update(['status' => 'pending', 'held_at' => null]);
                $order->refresh();
            }

            $this->allocation->assertTenderCap($order, $paymentRows);

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

                $payment = Payment::create([
                    'order_id' => $order->id,
                    'method' => $paymentPayload['method'],
                    'amount' => $paymentPayload['amount'],
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
                ->selectRaw('COALESCE(SUM(amount_laar), SUM(ROUND(amount * 100))) as total_laar')
                ->value('total_laar');

            $orderTotalLaar = $order->total_laar ?? (int) round($order->total * 100);
            $paidTotal = round($paidTotalLaar / 100, 2);

            if ($paidTotalLaar >= $orderTotalLaar) {
                $order->update([
                    'status' => 'paid',
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
                $order->update([
                    'status' => 'partial',
                    'payment_status' => 'partial',
                ]);

                $this->audit->log('order.partial', 'Order', $order->id, ['status' => $oldStatus], ['status' => 'partial'], ['paid_total' => $paidTotal], $request);
            }

            return [$order, $paidTotal];
        });
    }
}
