<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\PrayerTimes\Support\PrayerCacheVersion;
use Illuminate\Console\Command;

class PrayerClearCache extends Command
{
    protected $signature = 'prayer:clear-cache';

    protected $description = 'Clear all cached prayer times and island data';

    public function handle(): int
    {
        $version = PrayerCacheVersion::bump();

        $this->info("Prayer cache invalidated (version {$version}). All island lists and prayer time lookups will refresh on next request.");

        return self::SUCCESS;
    }
}
