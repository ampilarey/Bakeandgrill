<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

class PrayerClearCache extends Command
{
    protected $signature   = 'prayer:clear-cache';
    protected $description = 'Clear all cached prayer times and island data';

    public function handle(): int
    {
        Cache::forget('prayer_islands_all');

        // The prayer_times.* keys are per-island-per-date — flush entire cache store
        // if using a dedicated store, or accept that a full flush is the safest approach
        $this->info('Cleared island list cache.');
        $this->info('To fully purge all prayer time caches, run: php artisan cache:clear');

        return self::SUCCESS;
    }
}
