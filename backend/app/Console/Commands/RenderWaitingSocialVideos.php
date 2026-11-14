<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Social\Jobs\RenderSocialVideoJob;
use App\Domains\Social\Services\SocialVideoRenderer;
use App\Models\SocialVideoRendition;
use Illuminate\Console\Command;
use Throwable;

/**
 * Renders the item videos that are waiting (owner, 2026-11-15: "Long time
 * now video doesn't render"; a clip sat at "queued"). The `social` queue's
 * own worker is started by the deploy and leaves after an hour with nothing
 * to bring it back, so a render asked for later waited for ever. The
 * scheduler runs this every minute instead: it needs no worker, does nothing
 * when nothing waits, and renders one clip at a time, as the worker did:
 * while a clip is rendering, a later run leaves the rest waiting.
 *
 * A clip is claimed before it is rendered (queued → processing in one
 * update), and the queued job claims the same way, so a worker that is
 * running and this command never render the same clip twice. A clip left at
 * "processing" by a run that was killed is marked failed, so the screen
 * offers Generate again instead of "Rendering…" for ever.
 */
class RenderWaitingSocialVideos extends Command
{
    /** A render is cut off at 15 minutes (the job's timeout); twice that is a run that died. */
    public const STUCK_MINUTES = 30;

    protected $signature = 'social:render-waiting {--minutes=3 : Stop starting new clips after this long}';

    protected $description = 'Render the Social Hub item videos that are waiting';

    public function handle(SocialVideoRenderer $renderer): int
    {
        SocialVideoRendition::query()
            ->where('status', SocialVideoRendition::STATUS_PROCESSING)
            ->where('updated_at', '<', now()->subMinutes(self::STUCK_MINUTES))
            ->update([
                'status' => SocialVideoRendition::STATUS_FAILED,
                'error_message' => 'The render stopped part way. Tap Generate to try again.',
                'updated_at' => now(),
            ]);

        // One at a time: a clip still rendering (in an earlier run of this command, or on a
        // worker) holds the next one back, whatever the scheduler's own lock has done since.
        if (SocialVideoRendition::query()->where('status', SocialVideoRendition::STATUS_PROCESSING)->exists()) {
            return self::SUCCESS;
        }

        $until = now()->addMinutes(max(1, (int) $this->option('minutes')));
        $done = 0;
        while (now()->lt($until)) {
            $next = SocialVideoRendition::query()->where('status', SocialVideoRendition::STATUS_QUEUED)->orderBy('id')->first();
            if ($next === null) {
                break;
            }
            if (!RenderSocialVideoJob::claim($next->id)) {
                continue;
            }
            try {
                $renderer->render($next->refresh());
                $done++;
            } catch (Throwable $e) {
                $next->forceFill(['status' => SocialVideoRendition::STATUS_FAILED, 'error_message' => mb_substr($e->getMessage(), 0, 1000)])->save();
                report($e);
            }
        }
        if ($done > 0) {
            $this->info("Rendered {$done} video(s).");
        }

        return self::SUCCESS;
    }
}
