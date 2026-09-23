<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\Item;
use App\Models\SocialPost;

/**
 * "Chef's pick" (Social Hub audit, 2026-09-24). On the chosen weekdays at
 * the configured time, one featured item (the Chef's picks the website,
 * order app and TV board already show), rotating so the item that was
 * posted longest ago goes next. Photographed items first; with none, the
 * caption-only post skips photo-required channels.
 *
 * Dedupe: one post per day ("auto_featured:{date}:{channel}").
 */
class FeaturedItemAutoPoster
{
    public const SOURCE = 'auto_featured';

    public function __construct(
        private readonly SocialAutomationSettings $settings,
        private readonly AutoPostDrafter $drafter,
    ) {}

    public function dedupePrefix(string $businessDate): string
    {
        return self::SOURCE . ':' . $businessDate;
    }

    public function run(): ?SocialPost
    {
        $config = $this->settings->forKind('featured');
        if (!$config['enabled'] || $config['channel_ids'] === []) {
            return null;
        }

        $today = now(config('app.timezone', 'Indian/Maldives'));
        if (!in_array((int) $today->dayOfWeek, $config['days'], true)) {
            return null;
        }

        $businessDate = $today->toDateString();
        if ($this->drafter->alreadyDrafted($this->dedupePrefix($businessDate))) {
            return null;
        }

        $item = $this->chooseItem();
        if ($item === null) {
            return null;
        }

        $price = $this->drafter->effectivePrice($item);
        $caption = $this->drafter->renderCaption($config['template'], $item, $price);

        return $this->drafter->draft(
            $config,
            $item,
            $caption,
            self::SOURCE,
            'item:' . $item->id,
            $this->dedupePrefix($businessDate),
            $businessDate,
        );
    }

    /** Featured, sellable; photographed first; least recently posted first. */
    private function chooseItem(): ?Item
    {
        $candidates = Item::query()
            ->with(['photos', 'category:id,name'])
            ->where('is_featured', true)
            ->where('is_active', true)
            ->where('is_available', true)
            ->orderBy('id')
            ->get();
        if ($candidates->isEmpty()) {
            return null;
        }

        $lastPosted = SocialPost::query()
            ->where('source', self::SOURCE)
            ->orderByDesc('id')
            ->get(['source_ref', 'created_at'])
            ->reduce(function (array $carry, SocialPost $post) {
                $id = (int) substr((string) $post->source_ref, strlen('item:'));
                if (!isset($carry[$id])) {
                    $carry[$id] = $post->created_at?->getTimestamp() ?? 0;
                }

                return $carry;
            }, []);

        $withPhoto = $candidates->filter(fn (Item $i) => $this->drafter->hasRealPhoto($i))->values();
        $pool = $withPhoto->isNotEmpty() ? $withPhoto : $candidates;

        return $pool->sortBy(fn (Item $i) => $lastPosted[$i->id] ?? 0)->first();
    }
}
