<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Domains\Orders\Events\OrderCancelled;
use App\Models\LoyaltyHold;
use App\Models\Order;
use App\Services\StockReservationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class CancelStaleOrders extends Command
{
    protected $signature = 'orders:cancel-stale';

    protected $description = 'Cancel payment_pending orders that have exceeded the TTL without payment';

    public function handle(): int
    {
        $ttl = (int) config('ordering.payment_pending_ttl_minutes', 30);
        $cutoff = now()->subMinutes($ttl);

        // Grace period: skip any order touched in the last 5 minutes.
        // A recent updated_at means the payment gateway is likely still in the process
        // of redirecting the customer or delivering a webhook. This prevents cancelling
        // an order that is actively being paid right now.
        $graceCutoff = now()->subMinutes(5);

        // Catering event deposits stay payment_pending until staff resend/cancel —
        // do not auto-expire them with the short online-order TTL.
        $stale = Order::where('status', 'payment_pending')
            ->where('type', '!=', 'catering')
            ->where('created_at', '<', $cutoff)
            ->where('updated_at', '<', $graceCutoff)
            ->get();

        if ($stale->isEmpty()) {
            return self::SUCCESS;
        }

        foreach ($stale as $staleOrder) {
            DB::transaction(function () use ($staleOrder, $ttl): void {
                // Row-lock the order inside the transaction to prevent a concurrent
                // cron run from cancelling the same order twice.
                $order = Order::lockForUpdate()->find($staleOrder->id);

                if (!$order || $order->status !== 'payment_pending') {
                    return; // Already processed by a concurrent run
                }

                app(\App\Services\OrderStatusTransitionService::class)->transition($order, 'cancelled');

                // Release prepared stock reservations (belt-and-suspenders —
                // OrderCancelled listener also fires, but inline release ensures
                // stock is freed even if queue workers are down).
                app(StockReservationService::class)->releaseForOrder($order->id);

                // Release loyalty holds properly (decrement points_held).
                // Do NOT raw-update hold status — that orphans points_held and
                // makes ReleaseLoyaltyHoldListener a no-op (looks for status=active).
                $hold = LoyaltyHold::query()
                    ->where('order_id', $order->id)
                    ->where('status', 'active')
                    ->first();
                if ($hold) {
                    app(LoyaltyLedgerService::class)->releaseHold($hold);
                }

                Log::info('CancelStaleOrders: cancelled stale payment_pending order', [
                    'order_id' => $order->id,
                    'order_number' => $order->order_number,
                    'created_at' => $order->created_at,
                    'ttl_minutes' => $ttl,
                ]);

                DB::afterCommit(function () use ($order): void {
                    OrderCancelled::dispatch(OrderCancelledData::fromOrder($order));
                });
            });
        }

        $this->info("Cancelled {$stale->count()} stale order(s).");

        return self::SUCCESS;
    }
}
