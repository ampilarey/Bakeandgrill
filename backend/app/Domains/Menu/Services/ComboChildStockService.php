<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use App\Models\Item;
use App\Models\OrderItem;
use App\Models\StockMovement;
use App\Services\StockManagementService;
use App\Services\StockReservationService;
use Illuminate\Support\Facades\DB;

/**
 * Expands fixed combo composition into prepared-stock operations on required children.
 *
 * OPTIONAL children (combo_items.is_optional = true) are NEVER deducted or restored.
 * The order stores no record of whether the customer took them, so we must not assume
 * they were. Stage 4 (platter child order lines) makes optional components trackable
 * properly — do not "fix" this by deducting optionals until then.
 *
 * If the combo item itself tracks stock, that behaviour is unchanged elsewhere;
 * children here are ADDITIONAL.
 */
class ComboChildStockService
{
    public function __construct(
        private readonly StockManagementService $stock,
    ) {}

    /**
     * Required (non-optional) combo children that track prepared stock.
     *
     * Quantity is child.quantity × how many combos were ordered.
     * Nested combos are expanded; cycles (self/nested loops) stop without error.
     * Children that do not track stock are skipped, not an error.
     *
     * @return list<array{item: Item, quantity: int}>
     */
    public function requiredChildrenForStock(Item $soldItem, int $lineQuantity): array
    {
        if ($lineQuantity <= 0 || !$soldItem->is_combo) {
            return [];
        }

        // Choice platters expand into real child order_items — never also deduct
        // via fixed combo_items composition (would double-take stock).
        if ($soldItem->isPlatter()) {
            return [];
        }

        $expanded = $this->expand($soldItem, $lineQuantity, []);

        // Aggregate duplicate child ids (nested repeats).
        $aggregated = [];
        foreach ($expanded as $entry) {
            $id = $entry['item']->id;
            if (!isset($aggregated[$id])) {
                $aggregated[$id] = $entry;
            } else {
                $aggregated[$id]['quantity'] += $entry['quantity'];
            }
        }

        return array_values($aggregated);
    }

    /**
     * Every required child, whether or not it tracks stock.
     *
     * Owner's audit, 2026-09-06 (F3): `requiredChildrenForStock` drops
     * children that do not track stock, which is right for a stock deduction
     * and wrong for an availability check — a dish 86'd with the "Sold out"
     * toggle usually tracks no stock at all, so nothing looked at it and the
     * bundle sold anyway.
     *
     * @return list<array{item: Item, quantity: int}>
     */
    public function requiredChildren(Item $soldItem, int $lineQuantity): array
    {
        if ($lineQuantity <= 0 || !$soldItem->is_combo || $soldItem->isPlatter()) {
            return [];
        }

        $expanded = $this->expand($soldItem, $lineQuantity, [], includeUntracked: true);

        $aggregated = [];
        foreach ($expanded as $entry) {
            $id = $entry['item']->id;
            if (!isset($aggregated[$id])) {
                $aggregated[$id] = $entry;
            } else {
                $aggregated[$id]['quantity'] += $entry['quantity'];
            }
        }

        return array_values($aggregated);
    }

    /**
     * @param array<int, true> $visiting
     * @return list<array{item: Item, quantity: int}>
     */
    private function expand(Item $item, int $multiplier, array $visiting, bool $includeUntracked = false): array
    {
        // Guard against nested/self-referencing combos looping forever.
        if (isset($visiting[$item->id])) {
            return [];
        }
        $visiting[$item->id] = true;

        if (!$item->relationLoaded('comboItems')) {
            $item->load(['comboItems.item.comboItems.item']);
        }

        if (!$item->is_combo || $item->isPlatter()) {
            return [];
        }

        $out = [];
        foreach ($item->comboItems as $row) {
            // OPTIONAL children are intentionally skipped — see class docblock.
            if ($row->is_optional) {
                continue;
            }

            $child = $row->item;
            if (!$child) {
                continue;
            }

            $qty = max(0, (int) $row->quantity) * $multiplier;
            if ($qty <= 0) {
                continue;
            }

            if ($child->is_combo) {
                foreach ($this->expand($child, $qty, $visiting, $includeUntracked) as $nested) {
                    $out[] = $nested;
                }

                continue;
            }

            // A child that does not track stock is skipped, not an error —
            // unless the caller is asking who the children *are* rather than
            // what to deduct.
            if (!$includeUntracked && (!$child->track_stock || $child->availability_type !== 'stock_based')) {
                continue;
            }

            $out[] = ['item' => $child, 'quantity' => $qty];
        }

        return $out;
    }

    public function saleKey(string $channelPrefix, int $orderId, int $orderItemId, int $childItemId): string
    {
        // channelPrefix is "pos:order:" or "online:order:"
        return $channelPrefix . $orderId . ':item:' . $orderItemId . ':child:' . $childItemId;
    }

    public function cancelKey(int $orderId, int $orderItemId, int $childItemId): string
    {
        return 'pos:cancel:order:' . $orderId . ':item:' . $orderItemId . ':child:' . $childItemId;
    }

    public function refundKey(int $orderId, int $orderItemId, int $childItemId, bool $isFullRefund, ?int $refundId): string
    {
        $key = 'refund:order:' . $orderId . ':item:' . $orderItemId . ':child:' . $childItemId;

        return $isFullRefund ? $key : $key . ':partial:' . (int) $refundId;
    }

    public function editRestoreKey(int $orderId, int $orderItemId, int $childItemId): string
    {
        return 'pos:edit:order:' . $orderId . ':item:' . $orderItemId . ':child:' . $childItemId;
    }

    public function wasChildDeducted(int $orderId, int $orderItemId, int $childItemId): bool
    {
        return StockMovement::query()
            ->whereIn('idempotency_key', [
                $this->saleKey('pos:order:', $orderId, $orderItemId, $childItemId),
                $this->saleKey('online:order:', $orderId, $orderItemId, $childItemId),
            ])
            ->where('type', 'sale')
            ->exists();
    }

    /**
     * Assert each required child has enough available stock (same-day only).
     */
    public function assertChildrenAvailable(Item $soldItem, int $lineQuantity): void
    {
        /*
         * Flags first, for every required child. A dish switched off with the
         * "Sold out" toggle tracks no stock, so the loop below never saw it and
         * the bundle sold regardless (owner's audit, 2026-09-06, F3).
         */
        foreach ($this->requiredChildren($soldItem, $lineQuantity) as $entry) {
            /** @var Item $child */
            $child = $entry['item'];
            if (!$child->is_active || !$child->is_available || $child->isSnoozed()) {
                abort(422, "\"{$soldItem->name}\" cannot be made right now — \"{$child->name}\" is unavailable.");
            }
        }

        $reservation = app(StockReservationService::class);
        foreach ($this->requiredChildrenForStock($soldItem, $lineQuantity) as $entry) {
            /** @var Item $child */
            $child = $entry['item'];
            $qty = $entry['quantity'];
            $locked = Item::lockForUpdate()->find($child->id) ?? $child;
            $available = $reservation->getAvailableStock($locked);
            if ($available < $qty) {
                abort(422, "Insufficient stock for {$locked->name}. Available: {$available}, requested: {$qty}");
            }
        }
    }

    public function deductForOrderItem(
        Item $soldItem,
        OrderItem $orderItem,
        int $lineQuantity,
        string $channelPrefix,
        int $orderId,
        ?int $userId,
    ): void {
        foreach ($this->requiredChildrenForStock($soldItem, $lineQuantity) as $entry) {
            /** @var Item $child */
            $child = $entry['item'];
            $key = $this->saleKey($channelPrefix, $orderId, (int) $orderItem->id, (int) $child->id);
            $this->stock->deductPreparedStock($child, $entry['quantity'], $key, $orderId, $userId);
        }
    }

    /**
     * @param callable(Item $child): string $keyForChild
     */
    public function restoreForOrderItem(
        Item $soldItem,
        OrderItem $orderItem,
        int $restoreQty,
        int $lineQuantity,
        callable $keyForChild,
        int $orderId,
        ?int $userId,
        bool $onlyIfPreviouslyDeducted = false,
    ): void {
        if ($restoreQty <= 0 || $lineQuantity <= 0) {
            return;
        }

        // Scale child restore by the same ratio as the parent line restore.
        $ratio = $restoreQty / $lineQuantity;

        foreach ($this->requiredChildrenForStock($soldItem, $lineQuantity) as $entry) {
            /** @var Item $child */
            $child = $entry['item'];
            $childRestore = max(0, (int) floor($entry['quantity'] * $ratio));
            if ($childRestore <= 0) {
                continue;
            }

            if ($onlyIfPreviouslyDeducted && !$this->wasChildDeducted($orderId, (int) $orderItem->id, (int) $child->id)) {
                continue;
            }

            $this->stock->restorePreparedStock(
                $child,
                $childRestore,
                $keyForChild($child),
                $orderId,
                $userId,
            );
        }
    }

    /**
     * Reserve required combo children for an online order line.
     * releaseForOrder(order_id) already drops these by order_id — no listener change needed
     * beyond documenting that combo child reservations share the order_id keyspace.
     */
    public function reserveForOrderItem(OrderItem $orderItem, Item $soldItem, int $ttlMinutes): void
    {
        $lineQty = max(0, (int) round((float) $orderItem->quantity));
        foreach ($this->requiredChildrenForStock($soldItem, $lineQty) as $entry) {
            /** @var Item $child */
            $child = $entry['item'];
            $qty = $entry['quantity'];

            $locked = Item::lockForUpdate()->find($child->id);
            if (!$locked) {
                abort(422, "Item {$child->name} is no longer available.");
            }

            $reservation = app(StockReservationService::class);
            $reservation->releaseExpiredReservations($locked->id);
            $available = $reservation->getAvailableStock($locked);
            if ($available < $qty) {
                abort(422, "Not enough stock for {$locked->name}. Available: {$available}, requested: {$qty}");
            }

            // Distinct session_id per child so multiple children of the same combo
            // (and the parent line) can coexist under one order_id.
            DB::table('stock_reservations')
                ->where('item_id', $locked->id)
                ->whereNull('variant_id')
                ->where('order_id', $orderItem->order_id)
                ->where('session_id', 'order:' . $orderItem->order_id . ':combo_child:' . $orderItem->id . ':' . $locked->id)
                ->delete();

            DB::table('stock_reservations')->insert([
                'item_id' => $locked->id,
                'variant_id' => null,
                'order_id' => $orderItem->order_id,
                'session_id' => 'order:' . $orderItem->order_id . ':combo_child:' . $orderItem->id . ':' . $locked->id,
                'quantity' => $qty,
                'expires_at' => now()->addMinutes($ttlMinutes),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function convertChildrenToDeduction(OrderItem $orderItem, Item $soldItem, ?int $userId): void
    {
        $lineQty = max(0, (int) round((float) $orderItem->quantity));
        foreach ($this->requiredChildrenForStock($soldItem, $lineQty) as $entry) {
            /** @var Item $child */
            $child = $entry['item'];
            $locked = Item::lockForUpdate()->find($child->id);
            if (!$locked) {
                continue;
            }

            $key = $this->saleKey('online:order:', (int) $orderItem->order_id, (int) $orderItem->id, (int) $child->id);
            $this->stock->deductPreparedStock($locked, $entry['quantity'], $key, (int) $orderItem->order_id, $userId);

            DB::table('stock_reservations')
                ->where('item_id', $locked->id)
                ->whereNull('variant_id')
                ->where('order_id', $orderItem->order_id)
                ->where('session_id', 'order:' . $orderItem->order_id . ':combo_child:' . $orderItem->id . ':' . $locked->id)
                ->delete();
        }
    }
}
