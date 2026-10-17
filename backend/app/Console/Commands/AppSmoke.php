<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\System\SmokeChecks;
use Illuminate\Console\Command;

/**
 * After a deploy: does the site still take an order? (iruali import plan,
 * feature 16; see SmokeChecks.) Exits 1 on any failure, which is what
 * scripts/full-deploy.sh reads to decide on a rollback.
 */
class AppSmoke extends Command
{
    protected $signature = 'app:smoke';

    protected $description = 'Read the menu and place, check and cancel one order inside a rolled-back transaction';

    public function handle(SmokeChecks $smoke): int
    {
        $results = $smoke->run();
        foreach ($results as $r) {
            $this->line(($r['ok'] ? 'OK   ' : 'FAIL ') . $r['name'] . ': ' . $r['detail']);
        }
        $failures = SmokeChecks::failures($results);
        if ($failures > 0) {
            $this->error("{$failures} smoke check(s) failed.");

            return self::FAILURE;
        }
        $this->info('Smoke checks passed.');

        return self::SUCCESS;
    }
}
