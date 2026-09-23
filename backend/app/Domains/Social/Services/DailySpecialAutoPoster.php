<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\DailySpecial;
use App\Models\SocialPost;

/**
 * The daily-special automation (plan §2c). At the configured time it drafts
 * (or, in unattended mode, queues) ONE post per business day advertising an
 * active special.
 *
 * Policy: at most one automation post per channel per day, enforced by the
 * dedupe key "auto_special:{business date}:{channel}" — restarts and repeat
 * runs are database-level no-ops. Among several active specials, specials
 * whose item has a real photo win; ties rotate by day of year. An item with
 * no real photo posts caption-only, and photo-required channels (Instagram)
 * are skipped rather than fed a placeholder.
 */
class DailySpecialAutoPoster
{
    public function __construct(
        private readonly SocialAutomationSettings $settings,
        private readonly AutoPostDrafter $drafter,
    ) {}

    public const SOURCE = 'auto_special';

    public function dedupePrefix(string $businessDate): string
    {
        return self::SOURCE . ':' . $businessDate;
    }

    /** Create today's automation post if due and not already created. */
    public function run(): ?SocialPost
    {
        $config = $this->settings->forKind('special');
        if (!$config['enabled'] || $config['channel_ids'] === []) {
            return null;
        }

        $businessDate = $this->drafter->businessDate();

        // One automation post per day: if any delivery already carries
        // today's dedupe key, the work is done — whatever happened since.
        if ($this->drafter->alreadyDrafted($this->dedupePrefix($businessDate))) {
            return null;
        }

        $special = $this->chooseSpecial();
        if ($special === null) {
            return null; // nothing on special — post nothing, never spam
        }

        $item = $special->item;
        $price = $this->drafter->effectivePrice($item);
        $caption = $this->drafter->renderCaption($config['template'], $item, $price, [
            '{badge}' => trim((string) ($special->badge_label ?? '')),
            '{description}' => trim((string) ($special->description ?? '')),
        ]);

        return $this->drafter->draft(
            $config,
            $item,
            $caption,
            self::SOURCE,
            'special:' . $special->id,
            $this->dedupePrefix($businessDate),
            $businessDate,
            [
                'special_id' => $special->id,
                'offer_end_date' => $special->end_date?->toDateString(),
            ],
        );
    }

    /**
     * Active specials whose item is sellable; photographed items first,
     * rotation by day of year among the preferred group.
     */
    private function chooseSpecial(): ?DailySpecial
    {
        $candidates = DailySpecial::query()
            ->with('item.photos')
            ->where('is_active', true)
            ->orderBy('id')
            ->get()
            ->filter(function (DailySpecial $special) {
                $item = $special->item;

                return $special->isCurrentlyActive()
                    && $item !== null
                    && $item->is_active
                    && $item->is_available;
            })
            ->values();
        if ($candidates->isEmpty()) {
            return null;
        }

        $withPhoto = $candidates->filter(fn (DailySpecial $s) => $this->drafter->hasRealPhoto($s->item))->values();
        $pool = $withPhoto->isNotEmpty() ? $withPhoto : $candidates;

        return $pool[now(config('app.timezone', 'Indian/Maldives'))->dayOfYear % $pool->count()];
    }
}
