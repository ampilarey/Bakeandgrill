<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Services;

use App\Models\Order;
use Illuminate\Support\Collection;

/**
 * Estimates customer wait from open kitchen tickets and item prep times.
 * Assumes ~2 tickets cook in parallel (small café capacity).
 */
class WaitTimeEstimator
{
    private const DEFAULT_PREP_MINUTES = 12;

    private const PARALLEL_TICKETS = 2;

    private const MIN_WAIT = 5;

    private const MAX_WAIT = 60;

    /**
     * @return array{wait_minutes: int, queue_depth: int, workload_minutes: int}
     */
    public function estimate(): array
    {
        $orders = Order::query()
            ->with(['items.item:id,prep_time_minutes'])
            ->whereIn('status', ['pending', 'paid', 'partial', 'preparing', 'in_progress'])
            ->where('created_at', '>=', now()->subHours(2))
            ->get(['id', 'status']);

        return $this->fromOrders($orders);
    }

    /**
     * @param  Collection<int, Order>  $orders
     * @return array{wait_minutes: int, queue_depth: int, workload_minutes: int}
     */
    public function fromOrders(Collection $orders): array
    {
        $workload = 0;

        foreach ($orders as $order) {
            $prep = (int) ($order->items->max(function ($line) {
                return (int) ($line->item?->prep_time_minutes ?: self::DEFAULT_PREP_MINUTES);
            }) ?: self::DEFAULT_PREP_MINUTES);

            // In-progress tickets are partly done — count half remaining work.
            if (in_array($order->status, ['in_progress', 'preparing'], true)) {
                $prep = max(5, (int) ceil($prep * 0.5));
            }

            $workload += $prep;
        }

        $queueDepth = $orders->count();
        $wait = $queueDepth === 0
            ? self::MIN_WAIT
            : (int) ceil($workload / self::PARALLEL_TICKETS);

        return [
            'wait_minutes' => min(self::MAX_WAIT, max(self::MIN_WAIT, $wait)),
            'queue_depth' => $queueDepth,
            'workload_minutes' => $workload,
        ];
    }
}
