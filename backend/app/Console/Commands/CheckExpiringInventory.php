<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\InventoryItem;
use Illuminate\Console\Command;

class CheckExpiringInventory extends Command
{
    protected $signature   = 'inventory:check-expiry {--days=7 : Warn if expiry within this many days}';
    protected $description = 'List inventory items expiring within N days';

    public function handle(): int
    {
        $days     = (int) $this->option('days');
        $threshold = now()->addDays($days)->toDateString();

        $expiring = InventoryItem::where('is_active', true)
            ->whereNotNull('expiry_date')
            ->where('expiry_date', '<=', $threshold)
            ->orderBy('expiry_date')
            ->get();

        if ($expiring->isEmpty()) {
            $this->info("No items expiring within {$days} days.");
            return 0;
        }

        $this->warn("Items expiring within {$days} days:");
        $this->table(
            ['ID', 'Name', 'Stock', 'Unit', 'Expiry Date', 'Days Left'],
            $expiring->map(fn($i) => [
                $i->id,
                $i->name,
                number_format((float) $i->current_stock, 2),
                $i->unit ?? '-',
                $i->expiry_date->toDateString(),
                now()->diffInDays($i->expiry_date, false),
            ])
        );

        return 0;
    }
}
