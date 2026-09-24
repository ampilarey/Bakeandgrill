<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Social\Drivers\SocialPublishException;
use App\Models\SocialComment;
use App\Models\SocialPostDelivery;
use App\Support\OwnerPhones;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The comment inbox (owner's shortlist, 2026-09-24). Pulls comments on
 * recent Facebook and Instagram posts into social_comments, flags the
 * ones that read like somebody wanting to order, and sends one SMS an
 * hour at most when new flagged comments arrive. Replies go back through
 * the driver as the page.
 */
class SocialCommentSync
{
    public const RECENT_DAYS = 14;

    public function __construct(private readonly SocialDriverRegistry $drivers) {}

    /** @return int how many new comments were stored */
    public function syncRecent(int $days = self::RECENT_DAYS): int
    {
        $new = 0;
        $flaggedNew = 0;
        $deliveries = SocialPostDelivery::query()
            ->with('channel')
            ->where('status', SocialPostDelivery::STATUS_PUBLISHED)
            ->where('published_at', '>=', now()->subDays($days))
            ->whereHas('channel', fn ($q) => $q->whereIn('platform', ['facebook', 'instagram'])->where('is_enabled', true))
            ->orderBy('id')
            ->get();

        foreach ($deliveries as $delivery) {
            try {
                $list = $this->drivers->for($delivery->channel->platform)->comments($delivery->channel, $delivery);
            } catch (Throwable $e) {
                Log::info('social: comment fetch failed', ['delivery_id' => $delivery->id, 'error' => $e->getMessage()]);
                continue;
            }
            foreach ($list ?? [] as $c) {
                if ($c['id'] === '' || trim($c['text']) === '') {
                    continue;
                }
                $flagged = SocialComment::looksLikeAnOrder($c['text']);
                $comment = SocialComment::query()->firstOrCreate(
                    ['provider_comment_id' => $c['id']],
                    [
                        'social_post_delivery_id' => $delivery->id,
                        'author' => $c['author'],
                        'text' => $c['text'],
                        'posted_at' => $c['posted_at'] ? Carbon::parse($c['posted_at']) : null,
                        'flagged' => $flagged,
                    ],
                );
                if ($comment->wasRecentlyCreated) {
                    $new++;
                    if ($flagged) {
                        $flaggedNew++;
                    }
                }
            }
        }

        if ($flaggedNew > 0) {
            $this->alert($flaggedNew);
        }

        return $new;
    }

    public function reply(SocialComment $comment, string $message): void
    {
        $comment->loadMissing('delivery.channel');
        $channel = $comment->delivery?->channel;
        if ($channel === null) {
            throw SocialPublishException::validation('The channel this comment came from is gone.');
        }
        $id = $this->drivers->for($channel->platform)->reply($channel, $comment->provider_comment_id, $message);
        $comment->forceFill([
            'reply_text' => $message,
            'reply_provider_id' => $id !== '' ? $id : null,
            'replied_at' => now(),
            'read_at' => $comment->read_at ?? now(),
        ])->save();
    }

    private function alert(int $count): void
    {
        if (!Cache::add('social-comment-alert', 1, 3600)) {
            return;
        }
        try {
            foreach (OwnerPhones::for('owner_social_comments') as $phone) {
                app(SmsService::class)->send(new SmsMessage(
                    to: $phone,
                    message: "Social: {$count} new comment" . ($count === 1 ? '' : 's') . ' on your posts look like someone wants to order. Reply from Admin → Social Hub → Comments.',
                    type: 'owner_social_comments',
                    idempotencyKey: 'social-comments:' . now()->format('Y-m-d-H') . ':' . $phone,
                ));
            }
        } catch (Throwable $e) {
            Log::warning('social: comment alert SMS could not be sent', ['error' => $e->getMessage()]);
        }
    }
}
