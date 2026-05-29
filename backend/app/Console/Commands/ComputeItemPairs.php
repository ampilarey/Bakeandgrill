<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Marketing\Services\ItemAffinityService;
use Illuminate\Console\Command;

class ComputeItemPairs extends Command
{
    protected $signature = 'insights:compute-item-pairs {--days=90 : Lookback window in days}';

    protected $description = 'Recompute frequently-bought-together pair stats from paid orders';

    public function handle(ItemAffinityService $affinity): int
    {
        $days = max(7, (int) $this->option('days'));
        $rows = $affinity->recompute($days);
        $this->info("Stored {$rows} directed pair stat row(s) from the last {$days} days.");

        return self::SUCCESS;
    }
}
