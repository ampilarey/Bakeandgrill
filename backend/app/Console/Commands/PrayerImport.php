<?php

namespace App\Console\Commands;

use App\Domains\PrayerTimes\Actions\GetIslandCollection;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

class PrayerImport extends Command
{
    protected $signature   = 'prayer:import {--path= : Path to salat.db SQLite source file}';
    protected $description = 'Import prayer categories, islands and times from the salat.db SQLite source';

    public function handle(): int
    {
        $path = $this->option('path');

        if ($path) {
            // Override env var for this run
            putenv("PRAYER_TIMES_DB={$path}");
        }

        $this->call('db:seed', ['--class' => 'PrayerTimesSeeder', '--force' => true]);

        // Run the Latin names enrichment after a fresh import
        $this->call('prayer:add-latin-names');

        // Clear all cached data so fresh data is picked up immediately.
        // prayer_times.* keys are per-island-per-date, so a full flush is the
        // only reliable way to invalidate them without tagging support.
        Cache::flush();

        $this->info('Prayer data import complete. All caches cleared.');

        return self::SUCCESS;
    }
}
