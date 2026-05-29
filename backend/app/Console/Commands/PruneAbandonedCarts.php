<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Marketing\Services\MarketingAutomationService;
use Illuminate\Console\Command;

class PruneAbandonedCarts extends Command
{
    protected $signature = 'marketing:prune-abandoned-carts';

    protected $description = 'Delete abandoned cart snapshots older than the retention window';

    public function handle(MarketingAutomationService $marketing): int
    {
        $deleted = $marketing->pruneStaleCarts();
        $this->info("Pruned {$deleted} abandoned cart snapshot(s).");

        return self::SUCCESS;
    }
}
