<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use App\Models\ComboItem;
use App\Models\Item;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class ComboCompositionService
{
    /** @param list<array{item_id: int, quantity?: int, is_optional?: bool}> $rows */
    public function sync(Item $combo, array $rows): void
    {
        if (!$combo->is_combo) {
            ComboItem::where('combo_id', $combo->id)->delete();

            return;
        }

        $normalized = [];
        foreach ($rows as $row) {
            $itemId = (int) ($row['item_id'] ?? 0);
            if ($itemId <= 0 || $itemId === (int) $combo->id) {
                continue;
            }
            $normalized[] = [
                'item_id' => $itemId,
                'quantity' => max(1, (int) ($row['quantity'] ?? 1)),
                'is_optional' => (bool) ($row['is_optional'] ?? false),
            ];
        }

        if ($normalized === []) {
            throw new InvalidArgumentException('Combo items must include at least one component.');
        }

        DB::transaction(function () use ($combo, $normalized): void {
            ComboItem::where('combo_id', $combo->id)->delete();
            foreach ($normalized as $row) {
                ComboItem::create([
                    'combo_id' => $combo->id,
                    'item_id' => $row['item_id'],
                    'quantity' => $row['quantity'],
                    'is_optional' => $row['is_optional'],
                ]);
            }
        });
    }

    /** @return list<array<string, mixed>> */
    public function formatForApi(Item $combo): array
    {
        return $combo->comboItems()
            ->with(['item:id,name,name_dv,base_price,image_url,is_available,has_variants'])
            ->get()
            ->map(fn (ComboItem $row) => [
                'item_id' => $row->item_id,
                'quantity' => $row->quantity,
                'is_optional' => $row->is_optional,
                'item' => $row->item ? [
                    'id' => $row->item->id,
                    'name' => $row->item->name,
                    'name_dv' => $row->item->name_dv,
                    'base_price' => $row->item->base_price,
                    'image_url' => $row->item->display_image_url,
                    'is_available' => $row->item->is_available,
                    'has_variants' => $row->item->has_variants,
                ] : null,
            ])
            ->values()
            ->all();
    }
}
