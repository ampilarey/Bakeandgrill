<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Social\Services\SocialCommentSync;
use Illuminate\Console\Command;

/** Hourly: pull comments on the last two weeks' Facebook and Instagram posts. */
class SyncSocialComments extends Command
{
    protected $signature = 'social:sync-comments {--days=14}';

    protected $description = 'Pull comments on recent Facebook and Instagram posts into the Social Hub inbox';

    public function handle(SocialCommentSync $sync): int
    {
        $new = $sync->syncRecent(max(1, (int) $this->option('days')));
        $this->info("{$new} new comment" . ($new === 1 ? '' : 's') . '.');

        return self::SUCCESS;
    }
}
