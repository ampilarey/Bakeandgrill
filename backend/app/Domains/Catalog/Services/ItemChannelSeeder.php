<?php

declare(strict_types=1);

namespace App\Domains\Catalog\Services;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Models\Item;
use App\Models\ItemChannelAvailability;

/**
 * Give a brand-new item its channel availability rows.
 *
 * Without them the item is invisible everywhere: KitchenMenuResolver's
 * `scopeItemsForChannel` filters on `whereExists(item_channel_availability)`,
 * so a row created without them silently fails that check and never appears on
 * the POS or the website. The backfill migration only covered items that
 * existed when it ran.
 *
 * Extracted so every path that creates an item — the full editor and the
 * grid's new-item row — seeds the same way, rather than one of them quietly
 * producing items nobody can sell.
 */
class ItemChannelSeeder
{
    /**
     * @param list<array{channel?: string, is_enabled?: bool, valid_from?: ?string, valid_until?: ?string}>|null $rows
     */
    public function seed(Item $item, ?array $rows = null): void
    {
        if (is_array($rows) && $rows !== []) {
            foreach ($rows as $row) {
                if (empty($row['channel'])) {
                    continue;
                }
                ItemChannelAvailability::query()->updateOrCreate(
                    ['item_id' => $item->id, 'channel' => $row['channel']],
                    [
                        'is_enabled' => (bool) ($row['is_enabled'] ?? true),
                        'valid_from' => $row['valid_from'] ?? null,
                        'valid_until' => $row['valid_until'] ?? null,
                    ],
                );
            }

            return;
        }

        foreach (KitchenMenuResolver::CHANNELS as $channel) {
            ItemChannelAvailability::query()->firstOrCreate(
                ['item_id' => $item->id, 'channel' => $channel],
                // Catering is opt-in; ordering channels default on so a new
                // item is immediately sellable everywhere.
                ['is_enabled' => $channel !== 'catering'],
            );
        }
    }
}
