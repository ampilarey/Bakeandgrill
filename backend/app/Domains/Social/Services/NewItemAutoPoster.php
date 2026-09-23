<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\Item;
use App\Models\SocialPost;

/**
 * "New on the menu" (Social Hub audit, 2026-09-24). Once a day at the
 * configured time, one item that joined the menu recently, is on sale, has
 * a real photo, and has not been announced before. Oldest first so nothing
 * is skipped while the window is open; an item without a photo simply
 * waits for one — a new-dish announcement without the dish is not worth
 * posting.
 *
 * Dedupe: one post per day ("auto_new_item:{date}:{channel}") and one per
 * item ever (source_ref "item:{id}").
 */
class NewItemAutoPoster
{
    public const SOURCE = 'auto_new_item';

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
        $config = $this->settings->forKind('new_item');
        if (!$config['enabled'] || $config['channel_ids'] === []) {
            return null;
        }

        $businessDate = $this->drafter->businessDate();
        if ($this->drafter->alreadyDrafted($this->dedupePrefix($businessDate))) {
            return null;
        }

        $item = $this->chooseItem((int) $config['max_age_days']);
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

    private function chooseItem(int $maxAgeDays): ?Item
    {
        $announced = SocialPost::query()
            ->where('source', self::SOURCE)
            ->whereNotIn('status', [SocialPost::STATUS_CANCELLED])
            ->pluck('source_ref')
            ->map(fn ($ref) => (int) substr((string) $ref, strlen('item:')))
            ->all();

        $candidates = Item::query()
            ->with(['photos', 'category:id,name'])
            ->where('is_active', true)
            ->where('is_available', true)
            ->where('created_at', '>=', now()->subDays($maxAgeDays))
            ->whereNotIn('id', $announced === [] ? [0] : $announced)
            ->orderBy('created_at')
            ->get();

        foreach ($candidates as $item) {
            if ($this->drafter->hasRealPhoto($item)) {
                return $item;
            }
        }

        return null;
    }
}
