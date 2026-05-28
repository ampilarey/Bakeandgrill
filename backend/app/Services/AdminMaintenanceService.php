<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Domains\Orders\Events\OrderCancelled;
use App\Models\Item;
use App\Models\Order;
use App\Models\RestaurantTable;
use App\Models\Shift;
use App\Models\Variant;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class AdminMaintenanceService
{
    /** @var list<string> */
    private const BLOCKED_STATUSES = ['paid', 'completed', 'partial', 'refunded', 'partially_refunded'];

    /** @var list<string> */
    private const TERMINAL_STATUSES = ['cancelled', 'completed', 'refunded'];

    /** @return array<string, mixed> */
    public function preview(int $olderThanDays = 1): array
    {
        $cutoff = now()->subDays($olderThanDays);
        $candidates = $this->staleOpenOrdersQuery($cutoff)->get(['id', 'order_number', 'status', 'created_at', 'payment_status', 'type']);

        [$eligible, $skipped] = $this->partitionCandidates($candidates);

        $staleShifts = Shift::query()
            ->whereNull('closed_at')
            ->where('opened_at', '<', now()->subHours(24))
            ->with(['user:id,name'])
            ->orderBy('opened_at')
            ->get()
            ->map(fn (Shift $s) => [
                'id' => $s->id,
                'user_name' => $s->user?->name,
                'opened_at' => $s->opened_at,
            ]);

        return [
            'older_than_days' => $olderThanDays,
            'cutoff' => $cutoff->toIso8601String(),
            'open_tickets_total' => $candidates->count(),
            'eligible_count' => count($eligible),
            'skipped_count' => count($skipped),
            'eligible_sample' => array_slice($eligible, 0, 10),
            'skipped_sample' => array_slice($skipped, 0, 10),
            'stale_shifts_count' => $staleShifts->count(),
            'stale_shifts' => $staleShifts->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    public function cleanupStaleOpenTickets(int $olderThanDays, int $actorUserId, ?Request $request = null): array
    {
        $cutoff = now()->subDays($olderThanDays);
        $reason = 'Bulk cleanup — stale open ticket';

        $orders = $this->staleOpenOrdersQuery($cutoff)->orderBy('id')->get();
        $cancelled = [];
        $skipped = [];

        foreach ($orders as $staleOrder) {
            $result = DB::transaction(function () use ($staleOrder, $reason, $actorUserId, $request) {
                $order = Order::lockForUpdate()->find($staleOrder->id);
                if (!$order || in_array($order->status, self::TERMINAL_STATUSES, true)) {
                    return ['skipped' => true, 'reason' => 'already_terminal'];
                }

                $skipReason = $this->skipReason($order);
                if ($skipReason !== null) {
                    return ['skipped' => true, 'reason' => $skipReason];
                }

                $machine = app(OrderStatusMachine::class);
                if (!$machine->isAllowed($order->status, 'cancelled')) {
                    return ['skipped' => true, 'reason' => 'transition_not_allowed'];
                }

                $oldStatus = $order->status;
                $order->update([
                    'status' => 'cancelled',
                    'cancellation_reason' => $reason,
                    'cancelled_at' => now(),
                    'cancelled_by' => $actorUserId,
                ]);

                $this->restorePosStock($order, $actorUserId);
                $this->freeTableIfNeeded($order);

                app(AuditLogService::class)->log(
                    'order.cancelled',
                    'Order',
                    $order->id,
                    ['status' => $oldStatus],
                    ['status' => 'cancelled', 'reason' => $reason],
                    [
                        'source' => 'admin_maintenance',
                        'cancelled_by_user_id' => $actorUserId,
                    ],
                    $request,
                );

                DB::afterCommit(function () use ($order): void {
                    OrderCancelled::dispatch(OrderCancelledData::fromOrder($order->fresh()));
                });

                return ['cancelled' => true, 'id' => $order->id];
            });

            if (($result['cancelled'] ?? false) === true) {
                $cancelled[] = $result['id'];
            } else {
                $skipped[] = [
                    'id' => $staleOrder->id,
                    'reason' => $result['reason'] ?? 'unknown',
                ];
            }
        }

        return [
            'older_than_days' => $olderThanDays,
            'cancelled_count' => count($cancelled),
            'skipped_count' => count($skipped),
            'cancelled_ids' => $cancelled,
            'skipped_sample' => array_slice($skipped, 0, 20),
        ];
    }

    private function staleOpenOrdersQuery(\Illuminate\Support\Carbon $cutoff)
    {
        return Order::query()
            ->whereNotIn('status', self::TERMINAL_STATUSES)
            ->where('created_at', '<', $cutoff);
    }

    /**
     * @param Collection<int, Order> $candidates
     * @return array{0: list<array<string, mixed>>, 1: list<array<string, mixed>>}
     */
    private function partitionCandidates(Collection $candidates): array
    {
        $eligible = [];
        $skipped = [];

        foreach ($candidates as $order) {
            $skipReason = $this->skipReason($order);
            if ($skipReason !== null) {
                $skipped[] = [
                    'id' => $order->id,
                    'order_number' => $order->order_number,
                    'status' => $order->status,
                    'reason' => $skipReason,
                ];
            } else {
                $eligible[] = [
                    'id' => $order->id,
                    'order_number' => $order->order_number,
                    'status' => $order->status,
                    'created_at' => $order->created_at,
                ];
            }
        }

        return [$eligible, $skipped];
    }

    private function skipReason(Order $order): ?string
    {
        if (in_array($order->status, self::BLOCKED_STATUSES, true)) {
            return 'paid_or_settled_status';
        }
        if (in_array($order->payment_status, ['partial', 'paid'], true)) {
            return 'payment_recorded';
        }
        if ($order->payments()->whereIn('status', ['paid', 'completed', 'confirmed'])->exists()) {
            return 'confirmed_payment';
        }

        return null;
    }

    private function restorePosStock(Order $order, int $actorUserId): void
    {
        $isPosOrder = !in_array($order->type, ['online_pickup', 'delivery'], true);
        if (!$isPosOrder) {
            return;
        }

        $stockService = app(StockManagementService::class);
        $order->load('items');

        foreach ($order->items as $orderItem) {
            $qty = (int) $orderItem->quantity;
            if ($qty <= 0) {
                continue;
            }

            if ($orderItem->variant_id) {
                $variant = Variant::find($orderItem->variant_id);
                if ($variant && $variant->track_stock) {
                    $stockService->restoreVariantStock(
                        $variant,
                        $qty,
                        'pos:cancel:order:' . $order->id . ':variant:' . $orderItem->id,
                        $order->id,
                        $actorUserId,
                    );
                }
                continue;
            }

            if (!$orderItem->item_id) {
                continue;
            }

            $item = Item::find($orderItem->item_id);
            if (!$item || !$item->track_stock || $item->availability_type !== 'stock_based') {
                continue;
            }

            $stockService->restorePreparedStock(
                $item,
                $qty,
                'pos:cancel:order:' . $order->id . ':item:' . $orderItem->id,
                $order->id,
                $actorUserId,
            );
        }
    }

    private function freeTableIfNeeded(Order $order): void
    {
        if (!$order->restaurant_table_id) {
            return;
        }

        $hasOtherActive = Order::where('restaurant_table_id', $order->restaurant_table_id)
            ->where('id', '!=', $order->id)
            ->whereNotIn('status', ['cancelled', 'completed', 'refunded'])
            ->exists();

        if (!$hasOtherActive) {
            RestaurantTable::where('id', $order->restaurant_table_id)
                ->update(['status' => 'available']);
        }
    }
}
