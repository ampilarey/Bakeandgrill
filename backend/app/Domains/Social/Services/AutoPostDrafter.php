<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\Item;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use App\Services\EffectivePriceService;
use App\Support\SocialPreviewImage;
use Illuminate\Support\Facades\Log;

/**
 * What every automation does once it has chosen an item: work out the
 * shareable photo, drop channels that need a photo when there is none
 * (never feed a placeholder to Instagram), freeze the snapshot with the
 * effective price, and either queue the post (unattended) or leave it
 * awaiting approval with its channel choice and dedupe keys frozen.
 */
class AutoPostDrafter
{
    public function __construct(
        private readonly SocialPublisher $publisher,
        private readonly SocialPreviewImage $previews,
        private readonly SocialDriverRegistry $drivers,
    ) {}

    /** Whether the item has a real photo (not the site fallback). */
    public function hasRealPhoto(Item $item): bool
    {
        return $this->previews->forItem($item)['url'] !== $this->previews->siteFallback();
    }

    public function effectivePrice(Item $item): float
    {
        $resolved = app(EffectivePriceService::class)
            ->resolveUnitPrice($item->id, (float) $item->base_price, $item);

        return round((float) $resolved->unitPrice, 2);
    }

    /**
     * Render a caption template. `{item} {name_dv} {price} {description}
     * {category} {link}` are common to every automation; callers add
     * their own (the special's `{badge}`).
     *
     * @param array<string, string> $extra
     */
    public function renderCaption(string $template, Item $item, float $price, array $extra = []): string
    {
        $caption = strtr($template, $extra + [
            '{item}' => (string) $item->name,
            '{name_dv}' => trim((string) ($item->name_dv ?? '')),
            '{price}' => number_format($price, 2),
            '{description}' => trim((string) ($item->short_description ?: $item->description ?: '')),
            '{category}' => trim((string) ($item->category?->name ?? '')),
            '{link}' => url('/menu/' . $item->id),
            '{badge}' => '',
        ]);

        // Collapse blank lines left by empty variables.
        return trim((string) preg_replace("/\n{3,}/", "\n\n", (string) preg_replace('/^[ \t]+$/m', '', $caption)));
    }

    /**
     * Create the post (or nothing, when no channel can take it).
     *
     * @param array{channel_ids: list<int>, unattended: bool} $config
     * @param array<string, mixed> $snapshotExtra e.g. special_id, offer_end_date
     */
    public function draft(
        array $config,
        Item $item,
        string $caption,
        string $source,
        string $sourceRef,
        string $dedupePrefix,
        string $businessDate,
        array $snapshotExtra = [],
    ): ?SocialPost {
        $preview = $this->previews->forItem($item);
        $hasRealPhoto = $preview['url'] !== $this->previews->siteFallback();

        return $this->draftWith(
            $config,
            $caption,
            $hasRealPhoto ? $preview['url'] : null,
            url('/menu/' . $item->id),
            $source,
            $sourceRef,
            $dedupePrefix,
            $businessDate,
            ['item_id' => $item->id, 'price' => $this->effectivePrice($item)] + $snapshotExtra,
        );
    }

    /**
     * The same, for a post that is not about one item (the weekly card):
     * an explicit image and link, whatever extra the snapshot should carry.
     *
     * @param array{channel_ids: list<int>, unattended: bool} $config
     * @param array<string, mixed> $snapshotExtra
     */
    public function draftWith(
        array $config,
        string $caption,
        ?string $imageUrl,
        string $linkUrl,
        string $source,
        string $sourceRef,
        string $dedupePrefix,
        string $businessDate,
        array $snapshotExtra = [],
    ): ?SocialPost {
        $hasImage = $imageUrl !== null && $imageUrl !== '';

        $channels = SocialChannel::query()
            ->whereIn('id', $config['channel_ids'])
            ->where('is_enabled', true)
            ->get();
        $usable = $channels->filter(function (SocialChannel $channel) use ($hasImage) {
            $caps = $this->drivers->for($channel->platform)->capabilities();

            // Never feed a placeholder to a photo-required platform.
            return $hasImage || !$caps['requires_photo'];
        });
        if ($usable->isEmpty()) {
            Log::info("social: {$source} skipped — no usable channels", ['source_ref' => $sourceRef]);

            return null;
        }

        $snapshot = array_merge([
            'caption' => $caption,
            'image_url' => $hasImage ? $imageUrl : null,
            'image_fingerprint' => $hasImage ? sha1((string) $imageUrl) : null,
            'link_url' => $linkUrl,
            'item_id' => null,
            'price' => null,
        ], $snapshotExtra);

        // Spacing rules: an unattended automation that would land too close
        // to another post is scheduled for the next free slot instead.
        $slot = null;
        if ($config['unattended']) {
            $rules = app(SocialPostingRules::class);
            if ($rules->conflict(now()) !== null) {
                $slot = $rules->nextFreeSlot(now());
            }
        }

        $post = SocialPost::create([
            'status' => $config['unattended']
                ? ($slot !== null ? SocialPost::STATUS_SCHEDULED : SocialPost::STATUS_QUEUED)
                : SocialPost::STATUS_AWAITING_APPROVAL,
            'snapshot' => $snapshot,
            'source' => $source,
            'source_ref' => $sourceRef,
            'business_date' => $businessDate,
            'scheduled_at' => $slot,
        ]);

        if ($config['unattended'] && $slot === null) {
            $this->publisher->dispatch($post, $usable->pluck('id')->all(), $dedupePrefix);
        } else {
            // Approval mode (the pilot gate): freeze channel choice + dedupe
            // keys now; a social.publish holder approves via publishNow.
            foreach ($usable as $channel) {
                SocialPostDelivery::firstOrCreate(
                    ['dedupe_key' => $dedupePrefix . ':' . $channel->id],
                    [
                        'social_post_id' => $post->id,
                        'social_channel_id' => $channel->id,
                        'status' => SocialPostDelivery::STATUS_SCHEDULED,
                    ],
                );
            }
        }

        return $post;
    }

    /** True when any delivery already carries this prefix (the day's post exists, whatever became of it). */
    public function alreadyDrafted(string $dedupePrefix): bool
    {
        return SocialPostDelivery::query()->where('dedupe_key', 'like', $dedupePrefix . ':%')->exists();
    }

    public function businessDate(): string
    {
        return now(config('app.timezone', 'Indian/Maldives'))->toDateString();
    }
}
