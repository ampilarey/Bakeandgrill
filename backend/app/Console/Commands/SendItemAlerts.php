<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Menu\Services\ItemAlerts;
use Illuminate\Console\Command;

/** Launch the coming-soon dishes whose day has come and tell waiting customers (iruali import plan, feature 8). */
class SendItemAlerts extends Command
{
    protected $signature = 'items:alerts';

    protected $description = 'Put coming-soon dishes on sale on their day and tell customers waiting for a dish';

    public function handle(ItemAlerts $alerts): int
    {
        $launched = $alerts->launch();
        $sent = $alerts->notify();
        $this->info("Launched {$launched} dish(es); told {$sent} customer(s).");

        return self::SUCCESS;
    }
}
