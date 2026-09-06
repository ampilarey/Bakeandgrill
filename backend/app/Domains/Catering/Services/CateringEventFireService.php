<?php

declare(strict_types=1);

namespace App\Domains\Catering\Services;

use App\Models\CateringRequest;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Variant;
use App\Services\AuditLogService;
use App\Services\OrderStatusMachine;
use App\Services\PrintJobService;
use App\Services\StockManagementService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Fire a confirmed catering event order to the kitchen.
 *
 * Stock/86 checks happen HERE (approval skipped them). Shortages return a
 * soft warning; with confirm_shortages=true the fire still proceeds.
 * Idempotent: re-fire reprints via the kitchen:…:catering_fire key and
 * stock keys catering:fire:order:{id}:item:{lineId} prevent double-deduct.
 */
class CateringEventFireService
{
    public function __construct(
        private readonly StockManagementService $stock,
        private readonly OrderStatusMachine $statusMachine,
        private readonly PrintJobService $printJobs,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @return array{order: Order, fired: bool, already_fired: bool, shortages: list<array<string, mixed>>}
     */
    public function fire(CateringRequest $request, bool $confirmShortages, ?Request $http = null): array
    {
        $result = DB::transaction(function () use ($request, $confirmShortages, $http): array {
            $locked = CateringRequest::query()->lockForUpdate()->findOrFail($request->id);

            if ($locked->status === 'cancelled') {
                throw ValidationException::withMessages([
                    'status' => ['This event is cancelled.'],
                ]);
            }
            if (!in_array($locked->status, ['confirmed', 'completed'], true)) {
                throw ValidationException::withMessages([
                    'status' => ['Only confirmed events can be sent to the kitchen.'],
                ]);
            }
            if (!$locked->pos_order_id) {
                throw ValidationException::withMessages([
                    'order' => ['This event has no linked order yet.'],
                ]);
            }

            $order = Order::query()
                ->with(['items', 'customer'])
                ->lockForUpdate()
                ->findOrFail($locked->pos_order_id);

            if ($order->type !== 'catering') {
                throw ValidationException::withMessages([
                    'order' => ['Linked order is not a catering order.'],
                ]);
            }

            $alreadyFired = $order->fired_at !== null
                && !in_array($order->status, ['payment_pending', 'cancelled'], true);

            $shortages = $this->collectShortages($order);

            if ($shortages !== [] && !$confirmShortages && !$alreadyFired) {
                return [
                    'order' => $order,
                    'fired' => false,
                    'already_fired' => false,
                    'shortages' => $shortages,
                    'needs_confirm' => true,
                ];
            }

            if (!$alreadyFired) {
                $this->deductStockForFire($order, $confirmShortages && $shortages !== []);
                // Ingredients too. The payment-day listener skips catering
                // on purpose (stock is decided at fire), and until the
                // 2026-09-07 audit nothing else ever took them.
                app(\App\Domains\Inventory\Services\InventoryDeductionService::class)
                    ->deductForOrder($order, $http?->user()?->id);

                $oldStatus = $order->status;
                if ($order->status === 'payment_pending') {
                    $this->statusMachine->assertTransitionAllowed($order, 'pending');
                    $order->update([
                        'status' => 'pending',
                        'fired_at' => now(),
                    ]);
                } elseif (in_array($order->status, ['pending', 'in_progress', 'partial', 'paid'], true)) {
                    if (!$order->fired_at) {
                        $order->update(['fired_at' => now()]);
                    }
                } else {
                    abort(422, "Order is {$order->status} and cannot be fired to kitchen.");
                }

                $this->audit->log(
                    'catering.fired_to_kitchen',
                    'CateringRequest',
                    $locked->id,
                    ['order_status' => $oldStatus],
                    [
                        'order_status' => $order->fresh()->status,
                        'fired_at' => $order->fresh()->fired_at,
                        'shortages_confirmed' => $confirmShortages && $shortages !== [],
                    ],
                    [],
                    $http,
                );
            }

            return [
                'order' => $order->fresh(['items.modifiers', 'customer']),
                'fired' => true,
                'already_fired' => $alreadyFired,
                'shortages' => $shortages,
                'needs_confirm' => false,
            ];
        });

        if (($result['needs_confirm'] ?? false) === true) {
            return [
                'order' => $result['order'],
                'fired' => false,
                'already_fired' => false,
                'shortages' => $result['shortages'],
            ];
        }

        $order = $result['order'];
        DB::afterCommit(function () use ($order): void {
            try {
                // Dedicated reason so re-taps collapse into one print job.
                $this->printJobs->enqueueKitchen($order, 'catering_fire');
            } catch (\Throwable $e) {
                logger()->warning('CateringEventFireService: kitchen print failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }
        });

        return [
            'order' => $order,
            'fired' => true,
            'already_fired' => (bool) $result['already_fired'],
            'shortages' => $result['shortages'],
        ];
    }

    /**
     * @return list<array{item_name: string, order_item_id: int, requested: int, available: int|null, reason: string}>
     */
    private function collectShortages(Order $order): array
    {
        $shortages = [];
        foreach ($order->items as $line) {
            /** @var OrderItem $line */
            $qty = max(0, (int) $line->quantity);
            if ($qty <= 0 || !$line->item_id) {
                continue;
            }

            if ($line->variant_id) {
                $variant = Variant::query()->find($line->variant_id);
                if ($variant && $variant->track_stock) {
                    $available = (int) $variant->stock_quantity;
                    if ($available < $qty) {
                        $shortages[] = [
                            'item_name' => trim(($line->item_name ?? '') . ($line->variant_name ? ' — ' . $line->variant_name : '')),
                            'order_item_id' => (int) $line->id,
                            'requested' => $qty,
                            'available' => $available,
                            'reason' => 'insufficient_stock',
                        ];
                    }
                }
                continue;
            }

            $item = Item::query()->find($line->item_id);
            if (!$item) {
                continue;
            }

            if (!$item->is_available || !$item->is_active) {
                $shortages[] = [
                    'item_name' => (string) ($line->item_name ?: $item->name),
                    'order_item_id' => (int) $line->id,
                    'requested' => $qty,
                    'available' => null,
                    'reason' => !$item->is_available ? 'eighty_sixed' : 'inactive',
                ];
                continue;
            }

            if ($item->track_stock && $item->availability_type === 'stock_based') {
                $available = (int) $item->stock_quantity;
                if ($available < $qty) {
                    $shortages[] = [
                        'item_name' => (string) ($line->item_name ?: $item->name),
                        'order_item_id' => (int) $line->id,
                        'requested' => $qty,
                        'available' => $available,
                        'reason' => 'insufficient_stock',
                    ];
                }
            }
        }

        return $shortages;
    }

    private function deductStockForFire(Order $order, bool $allowShort): void
    {
        foreach ($order->items as $line) {
            /** @var OrderItem $line */
            $qty = max(0, (int) $line->quantity);
            if ($qty <= 0 || !$line->item_id) {
                continue;
            }

            $key = 'catering:fire:order:' . $order->id . ':item:' . $line->id;

            if ($line->variant_id) {
                $variant = Variant::query()->lockForUpdate()->find($line->variant_id);
                if (!$variant || !$variant->track_stock) {
                    continue;
                }
                $deductQty = $qty;
                if ($allowShort && (int) $variant->stock_quantity < $qty) {
                    $deductQty = max(0, (int) $variant->stock_quantity);
                }
                if ($deductQty <= 0) {
                    continue;
                }
                try {
                    $this->stock->deductVariantStock($variant, $deductQty, $key, (int) $order->id, null);
                } catch (\RuntimeException $e) {
                    if (!$allowShort) {
                        throw $e;
                    }
                }
                continue;
            }

            $item = Item::query()->lockForUpdate()->find($line->item_id);
            if (!$item || !$item->track_stock || $item->availability_type !== 'stock_based') {
                continue;
            }
            $deductQty = $qty;
            if ($allowShort && (int) $item->stock_quantity < $qty) {
                $deductQty = max(0, (int) $item->stock_quantity);
            }
            if ($deductQty <= 0) {
                continue;
            }
            try {
                $this->stock->deductPreparedStock($item, $deductQty, $key, (int) $order->id, null);
            } catch (\RuntimeException $e) {
                if (!$allowShort) {
                    throw $e;
                }
            }
        }
    }
}
