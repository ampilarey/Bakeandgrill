<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use App\Domains\Inventory\Services\RecipeStockService;
use App\Models\Item;
use App\Models\OrderItem;
use App\Models\StockMovement;
use App\Models\Variant;
use App\Services\StockManagementService;
use App\Services\StockReservationService;
use Illuminate\Support\Facades\DB;

/**
 * Expands fixed combo composition into prepared-stock operations on required children.
 *
 * OPTIONAL children (combo_items.is_optional = true) are NEVER deducted or restored
 * here: a taken optional extra becomes a child order line of its own (see
 * ComboOptionResolver), which moves stock through the ordinary line path.
 *
 * A child may name a SIZE (combo_items.variant_id) since the 2026-09-07 audit.
 * A sized child moves the size's own stock when that size tracks it, and its
 * recipe is drawn at the size's rate — exactly as if that size had been sold
 * on its own line.
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
     * Required (non-optional) combo children that track prepared stock, at the
     * item or the size level.
     *
     * Quantity is child.quantity × how many combos were ordered.
     * Nested combos are expanded; cycles (self/nested loops) stop without error.
     * Children that do not track stock are skipped, not an error.
     *
     * @return list<array{item: Item, variant: ?Variant, quantity: int}>
     */
    public function requiredChildrenForStock(Item $soldItem, int $lineQuantity): array
    {
        return array_values(array_filter(
            $this->requiredChildren($soldItem, $lineQuantity),
            fn (array $e) => self::tracksPreparedStock($e['item'], $e['variant']),
        ));
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
     * @return list<array{item: Item, variant: ?Variant, quantity: int}>
     */
    public function requiredChildren(Item $soldItem, int $lineQuantity): array
    {
        if ($lineQuantity <= 0 || !$soldItem->is_combo || $soldItem->isPlatter()) {
            return [];
        }

        $expanded = $this->expand($soldItem, $lineQuantity, []);

        // Aggregate duplicates (nested repeats) per item + size.
        $aggregated = [];
        foreach ($expanded as $entry) {
            $key = $entry['item']->id . ':' . ($entry['variant']?->id ?? 0);
            if (!isset($aggregated[$key])) {
                $aggregated[$key] = $entry;
            } else {
                $aggregated[$key]['quantity'] += $entry['quantity'];
            }
        }

        return array_values($aggregated);
    }

    public static function tracksPreparedStock(Item $item, ?Variant $variant): bool
    {
        if ($variant !== null) {
            return (bool) $variant->track_stock;
        }

        return (bool) $item->track_stock && $item->availability_type === 'stock_based';
    }

    /**
     * @param array<int, true> $visiting
     * @return list<array{item: Item, variant: ?Variant, quantity: int}>
     */
    private function expand(Item $item, int $multiplier, array $visiting): array
    {
        // Guard against nested/self-referencing combos looping forever.
        if (isset($visiting[$item->id])) {
            return [];
        }
        $visiting[$item->id] = true;

        if (!$item->relationLoaded('comboItems')) {
            $item->load(['comboItems.item.comboItems.item', 'comboItems.variant']);
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
                foreach ($this->expand($child, $qty, $visiting) as $nested) {
                    $out[] = $nested;
                }

                continue;
            }

            $variant = $row->variant_id
                ? ($row->relationLoaded('variant') ? $row->variant : Variant::find($row->variant_id))
                : null;

            $out[] = ['item' => $child, 'variant' => $variant, 'quantity' => $qty];
        }

        return $out;
    }

    public function saleKey(string $channelPrefix, int $orderId, int $orderItemId, int $childItemId, ?int $variantId = null): string
    {
        // channelPrefix is "pos:order:" or "online:order:"
        return $channelPrefix . $orderId . ':item:' . $orderItemId . ':child:' . $childItemId . self::sizeSuffix($variantId);
    }

    public function cancelKey(int $orderId, int $orderItemId, int $childItemId, ?int $variantId = null): string
    {
        return 'pos:cancel:order:' . $orderId . ':item:' . $orderItemId . ':child:' . $childItemId . self::sizeSuffix($variantId);
    }

    public function refundKey(int $orderId, int $orderItemId, int $childItemId, bool $isFullRefund, ?int $refundId, ?int $variantId = null): string
    {
        $key = 'refund:order:' . $orderId . ':item:' . $orderItemId . ':child:' . $childItemId . self::sizeSuffix($variantId);

        return $isFullRefund ? $key : $key . ':partial:' . (int) $refundId;
    }

    public function editRestoreKey(int $orderId, int $orderItemId, int $childItemId, ?int $variantId = null): string
    {
        return 'pos:edit:order:' . $orderId . ':item:' . $orderItemId . ':child:' . $childItemId . self::sizeSuffix($variantId);
    }

    private static function sizeSuffix(?int $variantId): string
    {
        return $variantId ? ':v' . $variantId : '';
    }

    public function wasChildDeducted(int $orderId, int $orderItemId, int $childItemId, ?int $variantId = null): bool
    {
        return StockMovement::query()
            ->whereIn('idempotency_key', [
                $this->saleKey('pos:order:', $orderId, $orderItemId, $childItemId, $variantId),
                $this->saleKey('online:order:', $orderId, $orderItemId, $childItemId, $variantId),
            ])
            ->where('type', 'sale')
            ->exists();
    }

    /**
     * Assert each required child can be made: its flags, its prepared stock
     * and — new in the 2026-09-07 audit — its ingredient pool.
     */
    public function assertChildrenAvailable(Item $soldItem, int $lineQuantity): void
    {
        $recipeStock = app(RecipeStockService::class);

        /*
         * Flags first, for every required child. A dish switched off with the
         * "Sold out" toggle tracks no stock, so the loop below never saw it and
         * the bundle sold regardless (owner's audit, 2026-09-06, F3).
         */
        foreach ($this->requiredChildren($soldItem, $lineQuantity) as $entry) {
            /** @var Item $child */
            $child = $entry['item'];
            /** @var Variant|null $variant */
            $variant = $entry['variant'];
            if (!$child->is_active || !$child->is_available || $child->isSnoozed()) {
                abort(422, "\"{$soldItem->name}\" cannot be made right now — \"{$child->name}\" is unavailable.");
            }
            if ($variant && (!$variant->is_active || !$variant->isAvailableNow())) {
                abort(422, "\"{$soldItem->name}\" cannot be made right now — \"{$child->name} {$variant->name}\" is unavailable.");
            }

            $portions = $recipeStock->portionsAvailable($child, $variant);
            if ($portions !== null && $portions < $entry['quantity']) {
                abort(422, "\"{$soldItem->name}\" cannot be made right now — not enough ingredients for \"{$child->name}\".");
            }
        }

        $reservation = app(StockReservationService::class);
        foreach ($this->requiredChildrenForStock($soldItem, $lineQuantity) as $entry) {
            /** @var Item $child */
            $child = $entry['item'];
            /** @var Variant|null $variant */
            $variant = $entry['variant'];
            $qty = $entry['quantity'];

            if ($variant) {
                $locked = Variant::lockForUpdate()->find($variant->id) ?? $variant;
                $available = $reservation->getAvailableVariantStock($locked);
                if ($available < $qty) {
                    abort(422, "Insufficient stock for {$child->name} {$locked->name}. Available: {$available}, requested: {$qty}");
                }

                continue;
            }

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
        bool $allowNegative = false,
    ): void {
        foreach ($this->requiredChildrenForStock($soldItem, $lineQuantity) as $entry) {
            /** @var Item $child */
            $child = $entry['item'];
            /** @var Variant|null $variant */
            $variant = $entry['variant'];
            $key = $this->saleKey($channelPrefix, $orderId, (int) $orderItem->id, (int) $child->id, $variant?->id);
            if ($variant) {
                $this->stock->deductVariantStock($variant, $entry['quantity'], $key, $orderId, $userId, $allowNegative);
            } else {
                $this->stock->deductPreparedStock($child, $entry['quantity'], $key, $orderId, $userId, $allowNegative);
            }
        }
    }

    /**
     * @param callable(Item $child, ?Variant $variant): string $keyForChild
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
            /** @var Variant|null $variant */
            $variant = $entry['variant'];
            $childRestore = max(0, (int) floor($entry['quantity'] * $ratio));
            if ($childRestore <= 0) {
                continue;
            }

            if ($onlyIfPreviouslyDeducted && !$this->wasChildDeducted($orderId, (int) $orderItem->id, (int) $child->id, $variant?->id)) {
                continue;
            }

            $key = $keyForChild($child, $variant);
            if ($variant) {
                $this->stock->restoreVariantStock($variant, $childRestore, $key, $orderId, $userId);
            } else {
                $this->stock->restorePreparedStock($child, $childRestore, $key, $orderId, $userId);
            }
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
        $reservation = app(StockReservationService::class);

        foreach ($this->requiredChildrenForStock($soldItem, $lineQty) as $entry) {
            /** @var Item $child */
            $child = $entry['item'];
            /** @var Variant|null $variant */
            $variant = $entry['variant'];
            $qty = $entry['quantity'];

            if ($variant) {
                $lockedVariant = Variant::lockForUpdate()->find($variant->id);
                if (!$lockedVariant) {
                    abort(422, "Item {$child->name} is no longer available.");
                }
                $reservation->releaseExpiredVariantReservations($lockedVariant->id);
                $available = $reservation->getAvailableVariantStock($lockedVariant);
                if ($available < $qty) {
                    abort(422, "Not enough stock for {$child->name} {$lockedVariant->name}. Available: {$available}, requested: {$qty}");
                }
                $session = $this->childSession($orderItem, $child->id, $lockedVariant->id);
                DB::table('stock_reservations')
                    ->where('variant_id', $lockedVariant->id)
                    ->where('order_id', $orderItem->order_id)
                    ->where('session_id', $session)
                    ->delete();
                DB::table('stock_reservations')->insert([
                    'item_id' => $child->id,
                    'variant_id' => $lockedVariant->id,
                    'order_id' => $orderItem->order_id,
                    'session_id' => $session,
                    'quantity' => $qty,
                    'expires_at' => now()->addMinutes($ttlMinutes),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                continue;
            }

            $locked = Item::lockForUpdate()->find($child->id);
            if (!$locked) {
                abort(422, "Item {$child->name} is no longer available.");
            }

            $reservation->releaseExpiredReservations($locked->id);
            $available = $reservation->getAvailableStock($locked);
            if ($available < $qty) {
                abort(422, "Not enough stock for {$locked->name}. Available: {$available}, requested: {$qty}");
            }

            // Distinct session_id per child so multiple children of the same combo
            // (and the parent line) can coexist under one order_id.
            $session = $this->childSession($orderItem, $locked->id, null);
            DB::table('stock_reservations')
                ->where('item_id', $locked->id)
                ->whereNull('variant_id')
                ->where('order_id', $orderItem->order_id)
                ->where('session_id', $session)
                ->delete();

            DB::table('stock_reservations')->insert([
                'item_id' => $locked->id,
                'variant_id' => null,
                'order_id' => $orderItem->order_id,
                'session_id' => $session,
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
            /** @var Variant|null $variant */
            $variant = $entry['variant'];
            $key = $this->saleKey('online:order:', (int) $orderItem->order_id, (int) $orderItem->id, (int) $child->id, $variant?->id);

            if ($variant) {
                $lockedVariant = Variant::lockForUpdate()->find($variant->id);
                if (!$lockedVariant) {
                    continue;
                }
                $this->stock->deductVariantStock($lockedVariant, $entry['quantity'], $key, (int) $orderItem->order_id, $userId);
                DB::table('stock_reservations')
                    ->where('variant_id', $lockedVariant->id)
                    ->where('order_id', $orderItem->order_id)
                    ->where('session_id', $this->childSession($orderItem, $child->id, $lockedVariant->id))
                    ->delete();

                continue;
            }

            $locked = Item::lockForUpdate()->find($child->id);
            if (!$locked) {
                continue;
            }

            $this->stock->deductPreparedStock($locked, $entry['quantity'], $key, (int) $orderItem->order_id, $userId);

            DB::table('stock_reservations')
                ->where('item_id', $locked->id)
                ->whereNull('variant_id')
                ->where('order_id', $orderItem->order_id)
                ->where('session_id', $this->childSession($orderItem, $locked->id, null))
                ->delete();
        }
    }

    private function childSession(OrderItem $orderItem, int $childId, ?int $variantId): string
    {
        return 'order:' . $orderItem->order_id . ':combo_child:' . $orderItem->id . ':' . $childId . ($variantId ? ':v' . $variantId : '');
    }
}
