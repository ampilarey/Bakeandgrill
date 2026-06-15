<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\PrayerTimes\Support\PrayerCacheVersion;
use Illuminate\Console\Command;

class PrayerImport extends Command
{
    protected $signature = 'prayer:import {--path= : Path to salat.db SQLite source file}';

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

        $version = PrayerCacheVersion::bump();

        $this->info("Prayer data import complete. Prayer cache invalidated (version {$version}).");

        return self::SUCCESS;
    }
}
