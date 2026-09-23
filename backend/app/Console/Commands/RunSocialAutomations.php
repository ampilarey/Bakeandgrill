<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Social\Services\DailySpecialAutoPoster;
use App\Domains\Social\Services\FeaturedItemAutoPoster;
use App\Domains\Social\Services\NewItemAutoPoster;
use App\Domains\Social\Services\SocialAutomationSettings;
use Illuminate\Console\Command;

/**
 * Runs every minute; fires each automation when Maldives local time
 * matches its configured posting time. The posters' per-day dedupe keys
 * make repeat invocations (restarts, overlapping ticks) no-ops.
 */
class RunSocialAutomations extends Command
{
    protected $signature = 'social:run-automations {--force : Run every automation regardless of the configured time}';

    protected $description = 'Run due social automations (daily special, new on the menu, chef\'s pick)';

    public function handle(
        SocialAutomationSettings $settings,
        DailySpecialAutoPoster $special,
        NewItemAutoPoster $newItem,
        FeaturedItemAutoPoster $featured,
    ): int {
        $localTime = now(config('app.timezone', 'Indian/Maldives'))->format('H:i');
        $posters = ['special' => $special, 'new_item' => $newItem, 'featured' => $featured];

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

        return self::SUCCESS;
    }
}
