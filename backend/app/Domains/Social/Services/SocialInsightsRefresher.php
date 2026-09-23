<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Pulls engagement numbers for published deliveries (Social Hub audit,
 * 2026-09-24: "no way to know which posts work"). Facebook and Instagram
 * report likes, comments and shares; Telegram and Viber offer nothing, so
 * those deliveries are left alone. Never throws and never changes a
 * delivery's status — the numbers are a nice-to-have.
 */
class SocialInsightsRefresher
{
    public const RECENT_DAYS = 30;

    public function __construct(private readonly SocialDriverRegistry $drivers) {}

    /** @return array<string, int>|null what was stored, or null when the platform gave nothing */
    public function refresh(SocialPostDelivery $delivery): ?array
    {
        $delivery->loadMissing('channel');
        $channel = $delivery->channel;
        if ($channel === null || $delivery->status !== SocialPostDelivery::STATUS_PUBLISHED) {
            return null;
        }

        try {
            $insights = $this->drivers->for($channel->platform)->insights($channel, $delivery);
        } catch (Throwable $e) {
            Log::info('social: insights fetch failed', ['delivery_id' => $delivery->id, 'error' => $e->getMessage()]);

            return null;
        }
        if ($insights === null) {
            return null;
        }

        $delivery->forceFill(['insights' => $insights, 'insights_at' => now()])->save();

        return $insights;
    }

    /** Every published delivery of one post. */
    public function refreshPost(SocialPost $post): void
    {
        foreach ($post->deliveries()->where('status', SocialPostDelivery::STATUS_PUBLISHED)->get() as $delivery) {
            $this->refresh($delivery);
        }
    }

    /** Published in the last month, on platforms that report anything. Returns how many were refreshed. */
    public function refreshRecent(int $days = self::RECENT_DAYS): int
    {
        $count = 0;
        $query = SocialPostDelivery::query()
            ->with('channel')
            ->where('status', SocialPostDelivery::STATUS_PUBLISHED)
            ->where('published_at', '>=', now()->subDays($days))
            ->whereHas('channel', fn ($q) => $q->whereIn('platform', ['facebook', 'instagram']))
            ->orderBy('id');

        foreach ($query->get() as $delivery) {
            if ($this->refresh($delivery) !== null) {
                $count++;
            }
        }

        return $count;
    }
}
