<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use App\Models\Item;
use Illuminate\Validation\ValidationException;

/**
 * Which optional extras the customer took, on a fixed bundle.
 *
 * Owner's audit, 2026-09-06 (F5): `combo_items.is_optional` changed one word
 * on a screen. The customer could not opt in or out, the order recorded
 * nothing either way, and `ComboChildStockService` deliberately never deducted
 * an optional child's stock — correctly, since nothing said whether it had
 * been taken.
 *
 * Now the choice is made in the order app and arrives in the same `children`
 * field a platter's picks use, so it becomes a real child order line: on the
 * kitchen ticket, through the ordinary stock path, and refundable on its own.
 * That is what `ComboChildStockService`'s docblock meant by "stage 4 makes
 * optional components trackable properly".
 *
 * The quantity is the owner's, not the customer's. A payload asking for
 * fifty free dips would otherwise be an order for fifty free dips, so the
 * definition's quantity is what gets written and the payload's is ignored.
 * Likewise the surcharge is read from `combo_items`, never from the client.
 */
final class ComboOptionResolver
{
    /**
     * @param list<array<string, mixed>> $childrenPayload
     * @return list<array{item: Item, quantity: int, surcharge: float, group_id: int|null}>
     */
    public function resolve(Item $combo, array $childrenPayload): array
    {
        if ($childrenPayload === []) {
            return [];
        }

        $combo->loadMissing('comboItems.item');

        // Only the optional rows are a choice. A required child comes with the
        // bundle and is never picked, so naming one is a client bug, not an
        // order.
        $optional = [];
        foreach ($combo->comboItems as $row) {
            if (!$row->is_optional || $row->item === null) {
                continue;
            }
            $optional[(int) $row->item_id] = $row;
        }

        $seen = [];
        $resolved = [];
        foreach ($childrenPayload as $payloadRow) {
            $itemId = (int) ($payloadRow['item_id'] ?? 0);
            $row = $optional[$itemId] ?? null;

            if ($row === null) {
                throw ValidationException::withMessages([
                    'items' => ["That is not an optional extra on \"{$combo->name}\"."],
                ]);
            }

            // Taking the same extra twice is one extra, not two — the choice
            // is take-it-or-leave-it, so a repeat is a duplicate submit.
            if (isset($seen[$itemId])) {
                continue;
            }
            $seen[$itemId] = true;

            $child = $row->item;
            if (!$child->is_active) {
                throw ValidationException::withMessages([
                    'items' => ["\"{$child->name}\" is no longer available."],
                ]);
            }

            $resolved[] = [
                'item' => $child,
                'quantity' => max(1, (int) $row->quantity),
                'surcharge' => max(0.0, (float) $row->surcharge),
                'group_id' => null,
            ];
        }

        return $resolved;
    }
}
