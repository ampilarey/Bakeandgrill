<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Social\Services\DailySpecialAutoPoster;
use App\Domains\Social\Services\SocialAutomationSettings;
use Illuminate\Console\Command;

/**
 * Runs every minute; fires the daily-special automation when Maldives local
 * time matches the configured posting time. The poster's per-day dedupe key
 * makes repeat invocations (restarts, overlapping ticks) no-ops.
 */
class RunSocialAutomations extends Command
{
    protected $signature = 'social:run-automations {--force : Run regardless of the configured time}';

    protected $description = 'Run due social automations (daily-special auto post)';

    public function handle(SocialAutomationSettings $settings, DailySpecialAutoPoster $poster): int
    {
        $config = $settings->all();
        $localTime = now(config('app.timezone', 'Indian/Maldives'))->format('H:i');

        if (!$this->option('force') && $localTime !== $config['time']) {
            return self::SUCCESS;
        }

        $post = $poster->run();
        if ($post !== null) {
            $this->info("Auto-special post {$post->id} created ({$post->status}).");
        }

        return self::SUCCESS;
    }
}
