<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Domains\Social\Services\AutoPostDrafter;
use App\Domains\Social\Services\SocialPostingRules;
use App\Models\Poster;
use App\Models\SocialChannel;
use App\Models\SocialPost;

/**
 * A draft for the connected channels, so approval, the best free time and
 * each channel's photo rule apply. WhatsApp and Viber are share links for
 * a phone; they are not a second publisher.
 */
final class PosterSocial
{
    /** @return array<string, mixed> */
    public static function draft(Poster $poster): array
    {
        $content = PosterContent::resolve($poster->toArray());
        $cards = PosterScreen::social($poster);
        $link = PosterLink::url($poster->code());
        $caption = self::caption($poster, $content, $link);
        $existing = SocialPost::query()
            ->where('source', 'poster')
            ->where('source_ref', $poster->code())
            ->latest('id')
            ->first();
        if ($existing instanceof SocialPost) {
            return self::payload($existing, $cards, $caption, $link);
        }

        $channelIds = SocialChannel::query()->where('is_enabled', true)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $post = null;
        if ($channelIds !== []) {
            $post = app(AutoPostDrafter::class)->draftWith(
                ['channel_ids' => $channelIds, 'unattended' => false],
                $caption,
                $cards['1200x630'] ?? null,
                $link,
                'poster',
                $poster->code(),
                'poster:' . $poster->code(),
                now(config('app.timezone', 'Indian/Maldives'))->toDateString(),
                [
                    'poster_id' => $poster->id,
                    'sizes' => $cards,
                ],
            );
        }
        if (!$post instanceof SocialPost) {
            $post = SocialPost::query()->create([
                'status' => SocialPost::STATUS_DRAFT,
                'snapshot' => [
                    'caption' => $caption,
                    'image_url' => $cards['1200x630'] ?? null,
                    'link_url' => $link,
                    'poster_id' => $poster->id,
                    'sizes' => $cards,
                ],
                'source' => 'poster',
                'source_ref' => $poster->code(),
                'business_date' => now(config('app.timezone', 'Indian/Maldives'))->toDateString(),
            ]);
        }

        $rules = app(SocialPostingRules::class);
        if ($rules->conflict(now(), $post->id) !== null) {
            $slot = $rules->nextFreeSlot(now(), $post->id);
            if ($slot !== null) {
                $post->forceFill(['scheduled_at' => $slot])->save();
            }
        }

        return self::payload($post->fresh() ?? $post, $cards, $caption, $link);
    }

    /**
     * @param array<string, mixed> $content
     */
    private static function caption(Poster $poster, array $content, string $link): string
    {
        $lines = array_filter([
            (string) ($content['headline'] ?? $poster->name),
            (string) ($content['price'] ?? ''),
            (string) ($content['subhead'] ?? ''),
            $link,
        ], static fn (string $line): bool => trim($line) !== '');

        return implode("\n", $lines);
    }

    /**
     * @param array<string, string> $cards
     * @return array<string, mixed>
     */
    private static function payload(SocialPost $post, array $cards, string $caption, string $link): array
    {
        $text = rawurlencode($caption);

        return [
            'post_id' => $post->id,
            'status' => $post->status,
            'image_url' => $cards['1200x630'] ?? $post->imageUrl(),
            'sizes' => $cards,
            'best_time' => $post->scheduled_at?->toIso8601String(),
            'whatsapp' => 'https://wa.me/?text=' . $text,
            'viber' => 'viber://forward?text=' . $text,
            'link' => $link,
        ];
    }
}
