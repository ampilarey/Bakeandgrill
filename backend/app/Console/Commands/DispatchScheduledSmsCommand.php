<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Sms\Services\SmsSchedulerService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class DispatchScheduledSmsCommand extends Command
{
    protected $signature = 'sms:dispatch-scheduled';

    protected $description = 'Dispatch any SMS scheduled messages that are due to be sent now.';

    public function handle(SmsSchedulerService $scheduler): int
    {
        $dispatched = $scheduler->dispatchDue(Carbon::now());

        if ($dispatched > 0) {
            $this->info("Dispatched {$dispatched} scheduled SMS message(s).");
        }

        return self::SUCCESS;
    }
}
