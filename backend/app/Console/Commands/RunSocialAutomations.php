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
        $now = now(config('app.timezone', 'Indian/Maldives'));
        // Back in stock is event-driven (ItemObserver), not on the clock.
        $posters = ['special' => $special, 'new_item' => $newItem, 'featured' => $featured, 'weekly' => $weekly];

        foreach ($posters as $kind => $poster) {
            $config = $settings->forKind($kind);
            // Due once the set time has passed, for a few hours after it
            // (Social Hub audit, 2026-10-01). It used to fire only when the
            // once-a-minute check landed on the exact minute, so a slow
            // previous run or a missed cron beat lost the whole day's post.
            // Each poster drafts at most once per business day, so a later
            // tick cannot post twice.
            if (!$this->option('force') && !self::due($now, (string) $config['time'])) {
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

    public const GRACE_MINUTES = 180;

    /** Within the grace window after the configured local time, today. */
    public static function due(\Carbon\CarbonInterface $now, string $time): bool
    {
        if (!preg_match('/^(\d{1,2}):(\d{2})$/', $time, $m)) {
            return false;
        }
        $start = $now->copy()->setTime((int) $m[1], (int) $m[2], 0);

        return $now->gte($start) && $now->lt($start->copy()->addMinutes(self::GRACE_MINUTES));
    }
}
