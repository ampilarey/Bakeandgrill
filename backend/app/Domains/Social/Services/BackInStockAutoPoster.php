<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\Item;
use App\Models\SocialPost;
use Illuminate\Support\Facades\Cache;

/**
 * "Back in stock" (owner's shortlist, 2026-09-24): when an item customers
 * ask about goes unavailable and comes back, an optional post — "Kulhi
 * boakibaa is back." Event-driven from the item observer, not on a clock.
 *
 * Guards against noise: only chef's picks unless told otherwise; the item
 * must have been gone for at least `min_out_hours` (a thirty-minute
 * snooze is not news); one post per item per day. When it went out is
 * remembered in the cache for a month, so a restart between the two
 * flips loses nothing that matters.
 */
class BackInStockAutoPoster
{
    public const SOURCE = 'auto_stock';

    public function __construct(
        private readonly SocialAutomationSettings $settings,
        private readonly AutoPostDrafter $drafter,
    ) {}

    public function dedupePrefix(string $businessDate, int $itemId): string
    {
        return self::SOURCE . ':' . $businessDate . ':' . $itemId;
    }

    /** Called when an item's availability flipped (either way). */
    public function itemChanged(Item $item): ?SocialPost
    {
        $key = 'social-stock-out:' . $item->id;
        if (!$item->is_available) {
            Cache::put($key, now()->toIso8601String(), 60 * 60 * 24 * 30);

            return null;
        }

        $outSince = Cache::pull($key);
        $config = $this->settings->forKind('stock');
        if (!$config['enabled'] || $config['channel_ids'] === []) {
            return null;
        }
        if (!$item->is_active || ($config['featured_only'] && !$item->is_featured)) {
            return null;
        }
        if ($config['min_out_hours'] > 0) {
            if (!is_string($outSince)) {
                return null; // we never saw it go out: not a comeback we can vouch for
            }
            // Measured forward from when it went out: Carbon 3 signs the difference.
            $hoursOut = \Carbon\Carbon::parse($outSince)->diffInMinutes(now()) / 60;
            if ($hoursOut < $config['min_out_hours']) {
                return null;
            }
        }

        $businessDate = $this->drafter->businessDate();
        $prefix = $this->dedupePrefix($businessDate, $item->id);
        if ($this->drafter->alreadyDrafted($prefix)) {
            return null;
        }

        $item->loadMissing(['photos', 'category:id,name']);
        $price = $this->drafter->effectivePrice($item);
        $caption = $this->drafter->renderCaption($config['template'], $item, $price);

        return $this->drafter->draft($config, $item, $caption, self::SOURCE, 'item:' . $item->id, $prefix, $businessDate);
    }
}
