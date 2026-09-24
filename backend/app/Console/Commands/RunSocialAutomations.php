<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Social\Services\DailySpecialAutoPoster;
use App\Domains\Social\Services\FeaturedItemAutoPoster;
use App\Domains\Social\Services\NewItemAutoPoster;
use App\Domains\Social\Services\OpeningHoursAutoPoster;
use App\Domains\Social\Services\SocialAutomationSettings;
use App\Domains\Social\Services\WeeklyMenuAutoPoster;
use Illuminate\Console\Command;

/**
 * Runs every minute; fires each automation when Maldives local time
 * matches its configured posting time. The posters' per-day dedupe keys
 * make repeat invocations (restarts, overlapping ticks) no-ops.
 */
class RunSocialAutomations extends Command
{
    protected $signature = 'social:run-automations {--force : Run every automation regardless of the configured time}';

    protected $description = 'Run due social automations (daily special, new on the menu, chef\'s pick, weekly card)';

    public function handle(
        SocialAutomationSettings $settings,
        DailySpecialAutoPoster $special,
        NewItemAutoPoster $newItem,
        FeaturedItemAutoPoster $featured,
        WeeklyMenuAutoPoster $weekly,
        OpeningHoursAutoPoster $hours,
    ): int {
        $localTime = now(config('app.timezone', 'Indian/Maldives'))->format('H:i');
        // Back in stock is event-driven (ItemObserver), not on the clock.
        $posters = ['special' => $special, 'new_item' => $newItem, 'featured' => $featured, 'weekly' => $weekly];

        foreach ($posters as $kind => $poster) {
            $config = $settings->forKind($kind);
            if (!$this->option('force') && $localTime !== $config['time']) {
                continue;
            }

            $post = $poster->run();
            if ($post !== null) {
                $this->info("Automation {$kind}: post {$post->id} created ({$post->status}).");
            }
        }

        // Opening hours watches for a change on every tick, whatever the time.
        $post = $hours->run();
        if ($post !== null) {
            $this->info("Automation hours: post {$post->id} created ({$post->status}).");
        }

        return self::SUCCESS;
    }
}
