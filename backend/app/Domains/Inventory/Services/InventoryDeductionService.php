<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Services;

use App\Domains\Inventory\DTOs\StockLevelChangedData;
use App\Domains\Inventory\Events\StockLevelChanged;
use App\Domains\Menu\Services\ComboChildStockService;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Recipe;
use App\Models\StockMovement;
use App\Models\Variant;
use App\Services\AuditLogService;
use App\Services\UnitConversionService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Ingredients leaving the store, and coming back.
 *
 * One engine for every channel. Menu-item stock audit, 2026-09-07: only
 * retail order lines ever consumed a recipe. A fixed bundle's required
 * children, a modifier's cheese, a catering order fired to the kitchen, a
 * wholesale delivery and a kitchen production batch all took nothing off the
 * shelf, so ingredient stock, usage-per-day and reorder figures under-counted
 * everything that was not a plain dish sold over the counter.
 *
 * Every deduction is one StockMovement under an idempotency key; a restore
 * is refused unless the matching deduction key exists, so nothing can be put
 * back that was never taken. Keys:
 *
 *   order:{o}:item:{line}:inv:{inv}                     the line's own recipe
 *   order:{o}:item:{line}:child:{item}[:v{var}]:inv:{inv}  a bundle child
 *   order:{o}:item:{line}:mod:{oim}:inv:{inv}           a modifier
 *   refund:… same shape, with :partial:{refund} for a part refund
 *
 * Other channels pass their own prefix (trade:dispatch:…, kitchen:produce:…).
 */
class InventoryDeductionService
{
    public function __construct(
        private readonly UnitConversionService $unitConversions,
        private readonly ComboChildStockService $combos,
    ) {}

    // ── Orders ───────────────────────────────────────────────────────────────

    public function deductForOrder(Order $order, ?int $userId = null): void
    {
        $this->deductForOrderAndDetectConflict($order, $userId);
    }

    /**
     * Deduct everything an order consumes. Returns true when any ingredient
     * ended up below zero (Policy A — the sale still stands, the count is
     * flagged).
     */
    public function deductForOrderAndDetectConflict(Order $order, ?int $userId = null): bool
    {
        $hadConflict = false;

        DB::transaction(function () use ($order, $userId, &$hadConflict): void {
            $this->loadOrder($order);
            $userId ??= $order->user_id;
            $notes = $order->order_number ? "Order {$order->order_number}" : 'Order deduction';

            foreach ($order->items as $orderItem) {
                foreach ($this->consumptionsForLine($orderItem) as $c) {
                    $prefix = 'order:' . $order->id . ':item:' . $orderItem->id . $c['suffix'];
                    $went = $this->consume(
                        $c['item'],
                        $c['variant'],
                        $c['portions'],
                        $prefix,
                        'order',
                        (int) $order->id,
                        $userId,
                        $notes,
                        modifierOverride: $c['ingredient'] ?? null,
                    );
                    $hadConflict = $hadConflict || $went;
                }
            }
        });

        return $hadConflict;
    }

    /**
     * Reverse deductForOrder() — in full, or by the share of the order that
     * was refunded. Only ingredients the order actually took come back.
     */
    public function restoreForOrder(Order $order, ?int $userId = null, float $ratio = 1.0, ?int $refundId = null): void
    {
        $ratio = max(0.0, min(1.0, $ratio));
        if ($ratio <= 0) {
            return;
        }

        DB::transaction(function () use ($order, $userId, $ratio, $refundId): void {
            $this->loadOrder($order);
            $userId ??= $order->user_id;
            $notes = $order->order_number ? "Refund of order {$order->order_number}" : 'Refund restore';
            $partial = $ratio >= 1.0 ? '' : ':partial:' . ($refundId ?? '0');

            foreach ($order->items as $orderItem) {
                foreach ($this->consumptionsForLine($orderItem) as $c) {
                    $deductPrefix = 'order:' . $order->id . ':item:' . $orderItem->id . $c['suffix'];
                    $restorePrefix = 'refund:' . $deductPrefix;
                    $this->restore(
                        $c['item'],
                        $c['variant'],
                        $c['portions'] * $ratio,
                        $deductPrefix,
                        $restorePrefix,
                        $partial,
                        'order',
                        (int) $order->id,
                        $userId,
                        $notes,
                        modifierOverride: $c['ingredient'] ?? null,
                    );
                }
            }
        });
    }

    // ── Generic channel API ──────────────────────────────────────────────────

    /**
     * Take the ingredients for `$portions` of `$item` (of `$variant`, if sized).
     *
     * A recipe that is consumed at production is skipped for `$context`
     * 'sale' and vice versa, so a dish never gives up its flour twice.
     *
     * @param array{inventory_item: InventoryItem, quantity: float, unit: ?string}|null $modifierOverride
     *                                                                                                    A single ingredient line instead of the item's recipe (modifiers).
     * @return bool true when any ingredient went below zero
     */
    public function consume(
        Item $item,
        ?Variant $variant,
        float $portions,
        string $keyPrefix,
        string $referenceType,
        int $referenceId,
        ?int $userId,
        string $notes,
        string $context = 'sale',
        string $movementType = 'sale',
        ?array $modifierOverride = null,
    ): bool {
        if ($portions <= 0) {
            return false;
        }

        $went = false;
        foreach ($this->ingredientLines($item, $variant, $portions, $context, $modifierOverride) as $line) {
            /** @var InventoryItem $inv */
            $inv = $line['inventory_item'];
            $key = $keyPrefix . ':inv:' . $inv->id;
            $result = $this->move($inv, -$line['quantity'], $key, $movementType, $referenceType, $referenceId, $userId, $notes, [
                'reference' => $notes,
            ]);
            $went = $went || $result;
        }

        return $went;
    }

    /**
     * Put back the ingredients a previous consume() took, in whole or in part.
     * Nothing comes back for an ingredient whose deduction key is absent.
     */
    public function restore(
        Item $item,
        ?Variant $variant,
        float $portions,
        string $deductKeyPrefix,
        string $restoreKeyPrefix,
        string $restoreKeySuffix,
        string $referenceType,
        int $referenceId,
        ?int $userId,
        string $notes,
        string $context = 'sale',
        string $movementType = 'refund',
        ?array $modifierOverride = null,
    ): void {
        if ($portions <= 0) {
            return;
        }

        foreach ($this->ingredientLines($item, $variant, $portions, $context, $modifierOverride) as $line) {
            /** @var InventoryItem $inv */
            $inv = $line['inventory_item'];
            $deductKey = $deductKeyPrefix . ':inv:' . $inv->id;
            if (!StockMovement::where('idempotency_key', $deductKey)->exists()) {
                continue;
            }

            $restoreKey = $restoreKeyPrefix . ':inv:' . $inv->id . $restoreKeySuffix;
            $this->move($inv, $line['quantity'], $restoreKey, $movementType, $referenceType, $referenceId, $userId, $notes, []);
        }
    }

    // ── What a line consumes ─────────────────────────────────────────────────

    /**
     * Every recipe an order line draws on: its own, its fixed bundle's
     * required children, and its modifiers' ingredients.
     *
     * @return list<array{item: Item, variant: ?Variant, portions: float, suffix: string, ingredient?: array}>
     */
    private function consumptionsForLine(OrderItem $orderItem): array
    {
        $item = $orderItem->item;
        if (!$item) {
            return [];
        }

        $lineQty = (float) $orderItem->quantity;
        if ($lineQty <= 0) {
            return [];
        }

        $out = [];

        // 1. The line's own recipe, at the size's rate.
        $out[] = [
            'item' => $item,
            'variant' => $orderItem->variant,
            'portions' => $lineQty * ($orderItem->variant?->consumptionFactor() ?? 1.0),
            'suffix' => '',
        ];

        // 2. A fixed bundle's required children. They are not order lines —
        //    only platter picks and optional extras are — so nothing else
        //    would ever look at their recipes.
        if ($item->is_combo && !$orderItem->parent_order_item_id) {
            $whole = max(0, (int) round($lineQty));
            foreach ($this->combos->requiredChildren($item, $whole) as $entry) {
                /** @var Item $child */
                $child = $entry['item'];
                /** @var Variant|null $childVariant */
                $childVariant = $entry['variant'] ?? null;
                $out[] = [
                    'item' => $child,
                    'variant' => $childVariant,
                    'portions' => (float) $entry['quantity'] * ($childVariant?->consumptionFactor() ?? 1.0),
                    'suffix' => ':child:' . $child->id . ($childVariant ? ':v' . $childVariant->id : ''),
                ];
            }
        }

        // 3. Modifiers that name an ingredient.
        $mods = $orderItem->relationLoaded('modifiers') ? $orderItem->modifiers : $orderItem->modifiers()->with('modifier.inventoryItem')->get();
        foreach ($mods as $oim) {
            $modifier = $oim->modifier;
            if (!$modifier || !$modifier->consumesIngredient() || !$modifier->inventoryItem) {
                continue;
            }
            $out[] = [
                'item' => $item,
                'variant' => null,
                'portions' => $lineQty * max(1, (int) $oim->quantity),
                'suffix' => ':mod:' . $oim->id,
                'ingredient' => [
                    'inventory_item' => $modifier->inventoryItem,
                    'quantity' => (float) $modifier->ingredient_quantity,
                    'unit' => $modifier->ingredient_unit,
                ],
            ];
        }

        return $out;
    }

    /**
     * The ingredient quantities `$portions` of something need, in each
     * ingredient's own unit.
     *
     * @return list<array{inventory_item: InventoryItem, quantity: float}>
     */
    private function ingredientLines(Item $item, ?Variant $variant, float $portions, string $context, ?array $modifierOverride): array
    {
        if ($modifierOverride !== null) {
            /** @var InventoryItem $inv */
            $inv = $modifierOverride['inventory_item'];
            $qty = $this->unitConversions->convert(
                (float) $modifierOverride['quantity'] * $portions,
                $modifierOverride['unit'] ?: $inv->unit,
                $inv->unit,
            );

            return $qty > 0 ? [['inventory_item' => $inv, 'quantity' => $qty]] : [];
        }

        $recipe = $item->relationLoaded('recipe') ? $item->recipe : $item->recipe()->first();
        if (!$recipe) {
            return [];
        }

        // 'sale' and 'production' each take only the recipes that belong to
        // them; 'any' (a staff meal, a test batch) takes every recipe — that
        // food is never sold, so nothing else would ever draw it.
        $atProduction = $recipe->consumedAtProduction();
        if (($context === 'sale' && $atProduction) || ($context === 'production' && !$atProduction)) {
            return [];
        }

        $yield = max(1.0, (float) $recipe->yield_quantity);
        $rows = $recipe->relationLoaded('recipeItems') ? $recipe->recipeItems : $recipe->recipeItems()->with('inventoryItem')->get();

        $out = [];
        foreach ($rows as $recipeItem) {
            $inv = $recipeItem->inventoryItem;
            $perUnit = (float) $recipeItem->quantity;
            if (!$inv || $perUnit <= 0) {
                continue;
            }
            $needed = $this->unitConversions->convert(
                ($perUnit * $portions) / $yield,
                $recipeItem->unit ?: $inv->unit,
                $inv->unit,
            );
            if ($needed > 0) {
                $out[] = ['inventory_item' => $inv, 'quantity' => $needed];
            }
        }

        return $out;
    }

    /**
     * One signed stock movement, under a row lock, once per key.
     *
     * @return bool true when the balance went below zero on this move
     */
    private function move(
        InventoryItem $inventoryItem,
        float $delta,
        string $key,
        string $type,
        string $referenceType,
        int $referenceId,
        ?int $userId,
        string $notes,
        array $auditContext,
    ): bool {
        return (bool) DB::transaction(function () use ($inventoryItem, $delta, $key, $type, $referenceType, $referenceId, $userId, $notes) {
            // Lock first, then check the key inside the lock — two concurrent
            // requests must not both pass the exists() check.
            $locked = DB::table('inventory_items')->where('id', $inventoryItem->id)->lockForUpdate()->first();
            if (!$locked) {
                return false;
            }
            if (StockMovement::where('idempotency_key', $key)->exists()) {
                return false;
            }

            $old = (float) $locked->current_stock;
            if ($delta < 0) {
                DB::table('inventory_items')->where('id', $inventoryItem->id)->decrement('current_stock', -$delta);
            } else {
                DB::table('inventory_items')->where('id', $inventoryItem->id)->increment('current_stock', $delta);
            }
            $inventoryItem->refresh();
            $new = (float) $inventoryItem->current_stock;

            $wentNegative = $delta < 0 && $new < 0;
            if ($wentNegative && $old >= 0) {
                // Stock audit, 2026-09-03 (S8): say it at the moment it happens.
                Log::warning('inventory.went_negative', [
                    'inventory_item_id' => $inventoryItem->id,
                    'name' => $inventoryItem->name,
                    'was' => $old,
                    'now' => $new,
                    'reference_type' => $referenceType,
                    'reference_id' => $referenceId,
                ]);
                app(AuditLogService::class)->log(
                    'inventory.went_negative',
                    'InventoryItem',
                    $inventoryItem->id,
                    ['current_stock' => $old],
                    ['current_stock' => $new],
                    ['reference_type' => $referenceType, 'reference_id' => $referenceId],
                );
            }

            event(new StockLevelChanged(new StockLevelChangedData(
                itemId: $inventoryItem->id,
                itemName: $inventoryItem->name,
                oldQuantity: $old,
                newQuantity: $new,
                reason: $delta < 0 ? 'sale' : 'refund',
            )));

            StockMovement::create([
                'idempotency_key' => $key,
                'inventory_item_id' => $inventoryItem->id,
                'user_id' => $userId,
                'type' => $type,
                'quantity' => $delta,
                'balance_after' => $new,
                'unit_cost' => $inventoryItem->unit_cost ?? 0,
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
                'notes' => $notes,
            ]);

            return $wentNegative;
        });
    }

    private function loadOrder(Order $order): void
    {
        $order->loadMissing([
            'items.item.recipe.recipeItems.inventoryItem',
            'items.item.comboItems.item.recipe.recipeItems.inventoryItem',
            'items.item.comboItems.variant',
            'items.variant',
            'items.modifiers.modifier.inventoryItem',
        ]);
    }

    /** Whether a recipe is consumed by the kitchen recording production rather than by a sale. */
    public static function recipeConsumedAtProduction(?Recipe $recipe): bool
    {
        return $recipe !== null && $recipe->consumedAtProduction();
    }
}
