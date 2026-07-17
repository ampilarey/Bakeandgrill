<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\InventoryItem;
use App\Models\InventoryReorderAlert;
use Illuminate\Console\Command;

class CheckReorderPoints extends Command
{
    protected $signature = 'inventory:check-reorder';

    protected $description = 'Create reorder alerts for raw inventory items at or below their reorder point';

    public function handle(): int
    {
        $items = InventoryItem::query()
            ->where('is_active', true)
            ->whereNotNull('reorder_point')
            ->whereColumn('current_stock', '<=', 'reorder_point')
            ->get();

        $created = 0;

        foreach ($items as $item) {
            $existing = InventoryReorderAlert::query()
                ->where('inventory_item_id', $item->id)
                ->whereNull('resolved_at')
                ->first();

            if ($existing) {
                $existing->update([
                    'current_stock' => $item->current_stock,
                    'reorder_point' => $item->reorder_point,
                ]);

                continue;
            }

            InventoryReorderAlert::create([
                'inventory_item_id' => $item->id,
                'current_stock' => $item->current_stock,
                'reorder_point' => $item->reorder_point,
            ]);
            $created++;
            $this->line("  Alert created: {$item->name} (stock: {$item->current_stock} {$item->unit}, reorder at: {$item->reorder_point})");
        }

        $resolved = 0;
        $openAlerts = InventoryReorderAlert::query()
            ->with('inventoryItem')
            ->whereNull('resolved_at')
            ->get();

        foreach ($openAlerts as $alert) {
            $item = $alert->inventoryItem;
            if (! $item || $item->reorder_point === null || (float) $item->current_stock > (float) $item->reorder_point) {
                $alert->update(['resolved_at' => now()]);
                $resolved++;
            }
        }

        if ($items->isEmpty() && $created === 0) {
            $this->info('All inventory items are above reorder point.');
        } else {
            $this->info("Created {$created} new reorder alert(s). {$items->count()} item(s) at or below reorder point. Resolved {$resolved}.");
        }

        return 0;
    }
}
