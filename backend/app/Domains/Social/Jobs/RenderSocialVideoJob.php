<?php

declare(strict_types=1);

namespace App\Domains\Social\Jobs;

use App\Domains\Social\Services\SocialVideoRenderer;
use App\Models\SocialVideoRendition;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

/**
 * Renders one rendition on the dedicated single-concurrency `social` queue
 * (its own low-priority worker — see full-deploy.sh) so a long render can
 * never sit in front of payments, orders or SMS. One try: a failed render
 * is visible in the UI and re-queued by a human, not silently retried at
 * shared-hosting CPU prices.
 */
class RenderSocialVideoJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public const QUEUE = 'social';

    public int $tries = 1;

    public int $timeout = 900;

    public function __construct(public readonly int $renditionId)
    {
        $this->onQueue(self::QUEUE);
    }

    public function handle(SocialVideoRenderer $renderer): void
    {
        $rendition = SocialVideoRendition::find($this->renditionId);
        if ($rendition === null || $rendition->status === SocialVideoRendition::STATUS_READY) {
            return;
        }

        $rendition->forceFill(['status' => SocialVideoRendition::STATUS_PROCESSING])->save();

        try {
            $renderer->render($rendition);
        } catch (Throwable $e) {
            $rendition->forceFill([
                'status' => SocialVideoRendition::STATUS_FAILED,
                'error_message' => mb_substr($e->getMessage(), 0, 1000),
            ])->save();

            throw $e;
        }
    }

    public function failed(): void
    {
        SocialVideoRendition::where('id', $this->renditionId)
            ->where('status', '!=', SocialVideoRendition::STATUS_READY)
            ->update(['status' => SocialVideoRendition::STATUS_FAILED]);
    }
}
