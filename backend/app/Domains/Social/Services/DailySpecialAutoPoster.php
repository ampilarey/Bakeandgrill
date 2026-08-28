<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use App\Services\EffectivePriceService;
use App\Support\SocialPreviewImage;
use Illuminate\Support\Facades\Log;

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
        private readonly SocialPublisher $publisher,
        private readonly SocialPreviewImage $previews,
    ) {}

    public const SOURCE = 'auto_special';

    public function dedupePrefix(string $businessDate): string
    {
        return self::SOURCE . ':' . $businessDate;
    }

    /** Create today's automation post if due and not already created. */
    public function run(): ?SocialPost
    {
        $config = $this->settings->all();
        if (!$config['enabled'] || $config['channel_ids'] === []) {
            return null;
        }

        $businessDate = now(config('app.timezone', 'Indian/Maldives'))->toDateString();

        // One automation post per day: if any delivery already carries
        // today's dedupe key, the work is done — whatever happened since.
        $alreadyPosted = SocialPostDelivery::query()
            ->where('dedupe_key', 'like', $this->dedupePrefix($businessDate) . ':%')
            ->exists();
        if ($alreadyPosted) {
            return null;
        }

        $special = $this->chooseSpecial();
        if ($special === null) {
            return null; // nothing on special — post nothing, never spam
        }

        $item = $special->item;
        $preview = $this->previews->forItem($item);
        $hasRealPhoto = $preview['url'] !== $this->previews->siteFallback();

        $channels = SocialChannel::query()
            ->whereIn('id', $config['channel_ids'])
            ->where('is_enabled', true)
            ->get();
        $registry = app(SocialDriverRegistry::class);
        $usable = $channels->filter(function (SocialChannel $channel) use ($registry, $hasRealPhoto) {
            $caps = $registry->for($channel->platform)->capabilities();

            // Never feed a placeholder to a photo-required platform.
            return $hasRealPhoto || !$caps['requires_photo'];
        });
        if ($usable->isEmpty()) {
            Log::info('social: auto-special skipped — no usable channels', ['special_id' => $special->id]);

            return null;
        }

        $price = $this->effectivePrice($item);
        $snapshot = [
            'caption' => $this->renderCaption($config['template'], $special, $item, $price),
            'image_url' => $hasRealPhoto ? $preview['url'] : null,
            'image_fingerprint' => $hasRealPhoto ? sha1($preview['url']) : null,
            'link_url' => url('/menu/' . $item->id),
            'item_id' => $item->id,
            'special_id' => $special->id,
            'price' => $price,
            'offer_end_date' => $special->end_date?->toDateString(),
        ];

        $post = SocialPost::create([
            'status' => $config['unattended'] ? SocialPost::STATUS_QUEUED : SocialPost::STATUS_AWAITING_APPROVAL,
            'snapshot' => $snapshot,
            'source' => self::SOURCE,
            'source_ref' => 'special:' . $special->id,
            'business_date' => $businessDate,
        ]);

        if ($config['unattended']) {
            $this->publisher->dispatch($post, $usable->pluck('id')->all(), $this->dedupePrefix($businessDate));
        } else {
            // Approval mode (the pilot gate): freeze channel choice + dedupe
            // keys now; a social.publish holder approves via publishNow.
            foreach ($usable as $channel) {
                SocialPostDelivery::firstOrCreate(
                    ['dedupe_key' => $this->dedupePrefix($businessDate) . ':' . $channel->id],
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

        $withPhoto = $candidates->filter(
            fn (DailySpecial $s) => $this->previews->forItem($s->item)['url'] !== $this->previews->siteFallback(),
        )->values();
        $pool = $withPhoto->isNotEmpty() ? $withPhoto : $candidates;

        return $pool[now(config('app.timezone', 'Indian/Maldives'))->dayOfYear % $pool->count()];
    }

    private function effectivePrice(Item $item): float
    {
        $resolved = app(EffectivePriceService::class)
            ->resolveUnitPrice($item->id, (float) $item->base_price, $item);

        return round((float) $resolved->unitPrice, 2);
    }

    private function renderCaption(string $template, DailySpecial $special, Item $item, float $price): string
    {
        $caption = strtr($template, [
            '{item}' => (string) $item->name,
            '{name_dv}' => trim((string) ($item->name_dv ?? '')),
            '{price}' => number_format($price, 2),
            '{badge}' => trim((string) ($special->badge_label ?? '')),
            '{description}' => trim((string) ($special->description ?? '')),
            '{link}' => url('/menu/' . $item->id),
        ]);

        // Collapse blank lines left by empty variables.
        return trim((string) preg_replace("/\n{3,}/", "\n\n", (string) preg_replace('/^[ \t]+$/m', '', $caption)));
    }
}
