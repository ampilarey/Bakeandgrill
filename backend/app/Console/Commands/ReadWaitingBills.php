<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Inventory\Bills\BillReader;
use Illuminate\Console\Command;

/**
 * Reads supplier bills that were sent in and not read by the screen that sent them
 * (the phone was put away, the request was cut off). Every minute, a few at a time.
 */
class ReadWaitingBills extends Command
{
    protected $signature = 'purchases:read-bills';

    protected $description = 'Read supplier bills waiting to be read into purchase orders';

    public function handle(BillReader $reader): int
    {
        if (!$reader->enabled()) {
            return self::SUCCESS;
        }
        $done = $reader->readWaiting();
        if ($done > 0) {
            $this->info("Read {$done} bill(s).");
        }

        return self::SUCCESS;
    }
}
