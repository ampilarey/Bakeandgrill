<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\System\ReadyChecks;
use Illuminate\Console\Command;

/**
 * Is this site ready to run unattended? The same list as System → Health's
 * System status (iruali import plan, feature 15). Exits 1 on any fail, so a
 * deploy script can stop on it.
 */
class AppReady extends Command
{
    protected $signature = 'app:ready';

    protected $description = 'Check database, Redis, queue, scheduler, mail, BML, SMS, backups and the restore drill';

    public function handle(ReadyChecks $ready): int
    {
        $checks = $ready->run();
        $marks = [ReadyChecks::PASS => 'ok', ReadyChecks::WARN => 'WARN', ReadyChecks::FAIL => 'FAIL', ReadyChecks::SKIP => '-'];
        $this->table(['', 'Check', 'Result', 'How to fix'], array_map(
            fn (array $c) => [$marks[$c['status']] ?? $c['status'], $c['label'], $c['detail'], $c['fix']],
            $checks,
        ));
        $failures = ReadyChecks::failures($checks);
        if ($failures > 0) {
            $this->error("{$failures} check(s) failed.");

            return self::FAILURE;
        }
        $this->info('Ready.');

        return self::SUCCESS;
    }
}
