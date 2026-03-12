<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\InventoryItem;
use App\Models\LowStockAlert;
use Illuminate\Console\Command;

class CheckReorderPoints extends Command
{
    protected $signature   = 'inventory:check-reorder';
    protected $description = 'Create low-stock alerts for items at or below their reorder point';

    public function handle(): int
    {
        $items = InventoryItem::where('is_active', true)
            ->whereNotNull('reorder_point')
            ->whereColumn('current_stock', '<=', 'reorder_point')
            ->get();

        if ($items->isEmpty()) {
            $this->info('All inventory items are above reorder point.');
            return 0;
        }

        $created = 0;

        foreach ($items as $item) {
            // Avoid duplicate active alerts
            $existing = LowStockAlert::where('inventory_item_id', $item->id)
                ->whereNull('resolved_at')
                ->exists();

            if (!$existing) {
                LowStockAlert::create([
                    'inventory_item_id' => $item->id,
                    'current_stock'     => $item->current_stock,
                    'reorder_point'     => $item->reorder_point,
                ]);
                $created++;
                $this->line("  Alert created: {$item->name} (stock: {$item->current_stock} {$item->unit}, reorder at: {$item->reorder_point})");
            }
        }

        $this->info("Created {$created} new low-stock alert(s). {$items->count()} item(s) at or below reorder point.");

        return 0;
    }
}
