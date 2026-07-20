<?php

declare(strict_types=1);

namespace App\Domains\Catering\Listeners;

use App\Domains\Catering\Services\CateringEventConfirmedNotifier;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Payments\Services\PaymentService;
use App\Models\CateringRequest;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Confirm catering events when quote_payment_laar is covered — NOT on OrderPaid.
 * Deposits leave the order partial; full pay also hits this path (and OrderPaid),
 * so confirmation is idempotent via status + SMS idempotency keys.
 */
class ConfirmCateringEventOnPaymentListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly PaymentService $payments,
        private readonly CateringEventConfirmedNotifier $notifier,
    ) {}

    public function handle(PaymentConfirmed $event): void
    {
        $order = Order::query()->find($event->data->orderId);
        if (!$order || $order->type !== 'catering') {
            return;
        }

        $request = CateringRequest::query()
            ->where('pos_order_id', $order->id)
            ->first();

        if (!$request) {
            return;
        }

        try {
            DB::transaction(function () use ($request, $order) {
                /** @var CateringRequest $locked */
                $locked = CateringRequest::query()->lockForUpdate()->findOrFail($request->id);
                if ($locked->status === 'confirmed') {
                    return;
                }

                $required = (int) ($locked->quote_payment_laar ?? 0);
                if ($required <= 0) {
                    return;
                }

                $paidLaar = (int) Payment::query()
                    ->where('order_id', $order->id)
                    ->whereIn('status', ['confirmed', 'paid', 'completed'])
                    ->sum('amount_laar');

                if ($paidLaar < $required) {
                    return;
                }

                $locked->update([
                    'status' => 'confirmed',
                    'confirmed_at' => $locked->confirmed_at ?? now(),
                ]);

                $orderTotal = (int) ($order->fresh()->total_laar ?? 0);
                $balanceLaar = max(0, $orderTotal - $paidLaar);

                DB::afterCommit(function () use ($locked, $paidLaar, $balanceLaar) {
                    $this->notifier->notify($locked->fresh() ?? $locked, $paidLaar, $balanceLaar);
                });
            });
        } catch (\Throwable $e) {
            Log::error('ConfirmCateringEventOnPaymentListener failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
