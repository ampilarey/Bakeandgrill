<?php

declare(strict_types=1);

namespace App\Domains\Signage\Services;

use App\Domains\PrayerTimes\Actions\GetIslandCollection;
use App\Domains\PrayerTimes\Actions\GetPrayerTimesForIslandAndDate;
use App\Domains\PrayerTimes\DTOs\IslandData;
use App\Domains\Reporting\Services\ItemSales;
use App\Models\Item;
use App\Models\SignageCampaign;
use App\Models\SignageScreen;
use App\Models\SiteSetting;
use App\Support\PrayerTimeHelper;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;

/**
 * Resolve effective signage config for a screen at "now".
 *
 * Order: group → screen → campaign → prayer break → emergency (wins).
 */
final class SignageResolver
{
    public function __construct(
        private readonly GetPrayerTimesForIslandAndDate $prayerTimes,
        private readonly GetIslandCollection $islands,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function resolve(?string $screenKey = null, ?Carbon $now = null, ?int $storeId = null): array
    {
        $now = $now ?? PrayerTimeHelper::nowInMvt();
        $version = SignageCache::version();
        $cacheKey = 'signage:resolved:' . ($screenKey ?: 'default') . ':' . ($storeId ?? 'all') . ':' . $version;

        $payload = SignageCache::remember($cacheKey, 30, function () use ($screenKey, $now, $storeId, $version) {
            return $this->resolveFresh($screenKey, $now, $storeId, $version);
        });

        // The clock is never the cached one (TV audit, 2026-11-26): the board sets its own clock from
        // `server_time`, and an answer up to 30 seconds old put every screen that far behind.
        if (is_array($payload)) {
            $payload['server_time'] = $now->toIso8601String();
            if (is_array($payload['variables'] ?? null)) {
                $payload['variables']['current_time'] = $now->format('g:i A');
                $payload['variables']['today'] = $now->format('l, j M Y');
            }
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    public function resolveFresh(?string $screenKey, Carbon $now, ?int $storeId, string $version): array
    {
        $screen = $this->findScreen($screenKey);
        $group = $screen?->group;
        $playlist = $screen?->playlist ?? $group?->playlist;

        $theme = array_merge(
            is_array($playlist?->theme) ? $playlist->theme : [],
            is_array($group?->theme) ? $group->theme : [],
            is_array($screen?->overrides['theme'] ?? null) ? $screen->overrides['theme'] : [],
        );

        $orientation = $screen?->orientation
            ?: $group?->orientation
            ?: 'landscape';
        $refresh = $screen?->refresh_seconds
            ?: $group?->refresh_seconds
            ?: 120;
        $resolution = $screen?->resolution ?: '1920x1080';

        $slides = is_array($playlist?->slides) ? $playlist->slides : [];
        $source = 'playlist';
        $playlistId = $playlist?->id;

        // Campaign override (highest priority matching)
        $campaign = $this->activeCampaign($now, $storeId ?? $screen?->store_id);
        if ($campaign) {
            if ($campaign->playlist_id && $campaign->playlist) {
                $slides = is_array($campaign->playlist->slides) ? $campaign->playlist->slides : $slides;
                $playlistId = $campaign->playlist_id;
                if (is_array($campaign->playlist->theme) && $campaign->playlist->theme !== []) {
                    $theme = array_merge($theme, $campaign->playlist->theme);
                }
            } elseif (is_array($campaign->slides) && $campaign->slides !== []) {
                $slides = $campaign->slides;
            }
            $source = 'campaign:' . $campaign->id;
        }

        $mode = 'normal';
        $emergency = $this->resolveEmergency($now);
        if ($emergency !== null) {
            $slides = [$emergency['slide']];
            $mode = $emergency['mode'];
            $source = 'emergency';
        } elseif ($this->inPrayerBreak($now)) {
            $slides = [SignageTemplateFactory::emergencySlide('prayer_break')];
            $mode = 'prayer_break';
            $source = 'prayer';
        }

        // Quick notices ride along in normal mode only: a slide at the front
        // of the loop and/or a line ahead of the ticker's own banners.
        $banner = $this->bannerConfig();
        if ($mode === 'normal') {
            $notices = SignageNotices::active($now);
            $noticeSlides = [];
            $noticeLines = [];
            foreach ($notices as $notice) {
                if (in_array($notice['show'], ['slide', 'both'], true)) {
                    $noticeSlides[] = SignageNotices::slide($notice);
                }
                if (in_array($notice['show'], ['ticker', 'both'], true)) {
                    $noticeLines[] = SignageNotices::bannerItem($notice);
                }
            }
            $slides = array_merge($noticeSlides, array_values($slides));
            if ($noticeLines !== []) {
                $banner['enabled'] = true;
                $banner['banners'] = array_merge($noticeLines, $banner['banners'] ?? []);
            }
        }

        $slides = self::dropOutsideSchedule($slides, $now);
        $rotation = WeightedRotation::buildOrder($slides);
        // What a running board compares to know its slides changed. It has to follow what is playing, not only
        // what was saved (TV audit, 2026-11-26): a prayer break, a scheduled closure, a campaign and a slide's
        // own dates all start by the clock with nothing saved, and a board that saw the same version kept its
        // old slides, so none of them reached a TV that was already on.
        $playing = sha1($version . '|' . $source . '|' . $mode . '|' . json_encode(array_values($slides)));
        $prayer = $this->prayerPayload($now);

        return [
            'screen' => $screen ? [
                'id' => $screen->id,
                'name' => $screen->name,
                'slug' => $screen->slug,
                'group_id' => $screen->group_id,
            ] : null,
            'playlist_id' => $playlistId,
            'playlist_version' => $playing,
            'source' => $source,
            'mode' => $mode,
            'orientation' => $orientation,
            'resolution' => $resolution,
            'refresh_seconds' => (int) $refresh,
            'theme' => $theme,
            'slides' => array_values($slides),
            'rotation' => $rotation,
            'variables' => $this->variables($now, $prayer['next_prayer']),
            'prayer_schedule' => $prayer['schedule'],
            'banner' => $banner,
            'bestsellers' => $this->bestsellers(8),
            'menu_new_days' => (int) SiteSetting::get('menu_new_days', 30),
            'sold_out_badge_minutes' => (int) SiteSetting::get('signage_sold_out_minutes', 20),
            // The screen's look: group under screen; null keeps the playlist's own.
            'layout' => SignageLayout::merge($group?->layout, $screen?->layout),
            'templates' => SignageTemplateFactory::templateCatalog(),
            'server_time' => $now->toIso8601String(),
        ];
    }

    private function findScreen(?string $key): ?SignageScreen
    {
        $base = fn () => SignageScreen::query()->with(['group.playlist', 'playlist']);
        if ($key === null || $key === '' || $key === 'default') {
            return $base()->where('is_default', true)->first()
                ?? $base()->where('slug', 'default')->first()
                ?? $base()->orderBy('id')->first();
        }
        if (ctype_digit($key)) {
            return $base()->where('id', (int) $key)->first()
                ?? $base()->where('slug', $key)->first();
        }

        return $base()->where('slug', $key)->first();
    }

    private function activeCampaign(Carbon $now, ?int $storeId): ?SignageCampaign
    {
        $q = SignageCampaign::query()
            ->with('playlist')
            ->where('is_active', true)
            ->where(function ($qq) use ($storeId) {
                $qq->whereNull('store_id');
                if ($storeId !== null) {
                    $qq->orWhere('store_id', $storeId);
                }
            })
            ->orderByDesc('priority')
            ->orderByDesc('id');

        foreach ($q->get() as $campaign) {
            if (!$this->campaignMatches($campaign, $now)) {
                continue;
            }

            return $campaign;
        }

        return null;
    }

    /**
     * A slide with a schedule (a poster sent to the TV) leaves the loop
     * once date_end has passed. Slides without a schedule are unchanged.
     *
     * @param list<mixed> $slides
     * @return list<mixed>
     */
    private static function dropOutsideSchedule(array $slides, Carbon $now): array
    {
        return array_values(array_filter($slides, static function ($slide) use ($now): bool {
            if (!is_array($slide)) {
                return false;
            }
            $schedule = $slide['schedule'] ?? null;
            if (!is_array($schedule) || $schedule === []) {
                return true;
            }

            return SignageScheduleMatcher::matches($schedule, $now);
        }));
    }

    private function campaignMatches(SignageCampaign $campaign, Carbon $now): bool
    {
        return SignageScheduleMatcher::matches([
            'date_start' => $campaign->date_start?->toDateString(),
            'date_end' => $campaign->date_end?->toDateString(),
            'days' => $campaign->days,
            'windows' => $campaign->windows,
        ], $now);
    }

    /**
     * Manual override wins; else highest-priority active scheduled entry.
     *
     * @return array{slide: array<string, mixed>, mode: string}|null
     */
    private function resolveEmergency(Carbon $now): ?array
    {
        $settings = SignageEmergencyNormalizer::normalizeFromSettings();
        $manual = $settings['manual'];
        if ($manual !== '' && $manual !== 'none') {
            return [
                'slide' => SignageTemplateFactory::emergencySlide($manual),
                'mode' => 'emergency:' . $manual,
            ];
        }

        $best = null;
        $bestPriority = -1;
        foreach ($settings['entries'] as $entry) {
            if (!($entry['is_active'] ?? false)) {
                continue;
            }
            $schedule = is_array($entry['schedule'] ?? null) ? $entry['schedule'] : [];
            if ($schedule !== [] && !SignageScheduleMatcher::matches($schedule, $now)) {
                continue;
            }
            $priority = (int) ($entry['priority'] ?? 0);
            if ($priority > $bestPriority) {
                $bestPriority = $priority;
                $best = $entry;
            }
        }

        if ($best === null) {
            return null;
        }

        $entryMode = (string) $best['mode'];

        return [
            'slide' => SignageTemplateFactory::emergencySlide($entryMode, [
                'id' => $best['id'] ?? null,
                'title' => $best['title'] ?? '',
                'body' => $best['body'] ?? '',
                'title_dv' => $best['title_dv'] ?? '',
                'body_dv' => $best['body_dv'] ?? '',
                'layout' => $best['layout'] ?? SignageEmergencyNormalizer::defaultLayoutForMode($entryMode),
                'reopen_at' => $best['reopen_at'] ?? null,
                'media_type' => $best['media_type'] ?? 'none',
                'media_url' => $best['media_url'] ?? '',
                'icon' => $best['icon'] ?? SignageEmergencyNormalizer::defaultIconForMode($entryMode),
            ]),
            'mode' => 'emergency:' . $entryMode,
        ];
    }

    private function inPrayerBreak(Carbon $now): bool
    {
        $raw = SiteSetting::get('signage_prayer', '{}');
        $cfg = is_string($raw) ? (json_decode($raw, true) ?: []) : (is_array($raw) ? $raw : []);
        if (!($cfg['enabled'] ?? false)) {
            return false;
        }
        $breakMinutes = max(1, (int) ($cfg['break_minutes'] ?? 15));
        $prayers = array_values(array_filter(array_map('strval', $cfg['prayers'] ?? ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'])));

        $island = $this->resolvePrayerIsland();
        if (!$island instanceof IslandData) {
            return false;
        }
        try {
            $result = $this->prayerTimes->execute($island, $now->copy()->startOfDay());
            if (!$result) {
                return false;
            }
            $map = $result->prayersOnly();
            $nowMin = ((int) $now->format('H')) * 60 + (int) $now->format('i');
            foreach ($prayers as $name) {
                $t = $map[$name] ?? null;
                if (!is_string($t) || !preg_match('/^\d{1,2}:\d{2}/', $t)) {
                    continue;
                }
                [$h, $m] = array_map('intval', explode(':', $t));
                $pMin = $h * 60 + $m;
                if ($nowMin >= $pMin && $nowMin < $pMin + $breakMinutes) {
                    return true;
                }
            }
        } catch (\Throwable) {
            return false;
        }

        return false;
    }

    /**
     * Island for banner countdown + automatic prayer-break windows.
     * Uses signage_prayer_island_id when set; otherwise Malé.
     */
    private function resolvePrayerIsland(): ?IslandData
    {
        try {
            $configuredId = (int) SiteSetting::get('signage_prayer_island_id', 0);
            if ($configuredId > 0) {
                $byId = $this->islands->findById($configuredId);
                if ($byId instanceof IslandData) {
                    return $byId;
                }
            }

            $collection = $this->islands->execute();

            return PrayerTimeHelper::findMaleIsland($collection)
                ?? $this->islands->findById(PrayerTimeHelper::MALE_ISLAND_FALLBACK_ID);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @return array{next_prayer: string, schedule: list<array{name: string, at: string}>}
     */
    private function prayerPayload(Carbon $now): array
    {
        $schedule = [];
        $nextPrayer = '';
        $island = $this->resolvePrayerIsland();
        if (!$island instanceof IslandData) {
            return ['next_prayer' => '', 'schedule' => []];
        }

        try {
            $result = $this->prayerTimes->execute($island, $now->copy()->startOfDay());
            if (!$result) {
                return ['next_prayer' => '', 'schedule' => []];
            }
            $nowMin = ((int) $now->format('H')) * 60 + (int) $now->format('i');
            foreach ($result->prayersOnly() as $name => $t) {
                if (!is_string($t) || !preg_match('/^\d{1,2}:\d{2}/', $t)) {
                    continue;
                }
                [$h, $m] = array_map('intval', explode(':', substr($t, 0, 5)));
                if ($h < 0 || $h > 23 || $m < 0 || $m > 59) {
                    continue;
                }
                $at = $now->copy()
                    ->timezone(PrayerTimeHelper::MVT_TIMEZONE)
                    ->setTime($h, $m, 0)
                    ->toIso8601String();
                $label = ucfirst((string) $name);
                $schedule[] = [
                    'name' => $label,
                    'at' => $at,
                ];
                $pMin = $h * 60 + $m;
                if ($nextPrayer === '' && $pMin > $nowMin) {
                    $nextPrayer = $label . ' ' . substr($t, 0, 5);
                }
            }
        } catch (\Throwable) {
            return ['next_prayer' => '', 'schedule' => []];
        }

        return [
            'next_prayer' => $nextPrayer,
            'schedule' => $schedule,
        ];
    }

    /**
     * @return array{enabled: bool, banners: list<array<string, mixed>>}
     */
    private function bannerConfig(): array
    {
        return SignageBannerNormalizer::normalize(SiteSetting::get('signage_banner', '{}'));
    }

    /**
     * @return array<string, string>
     */
    private function variables(Carbon $now, string $nextPrayer = ''): array
    {
        return [
            'branch_name' => (string) SiteSetting::get('site_name', 'Bake & Grill'),
            'current_time' => $now->format('g:i A'),
            'today' => $now->format('l, j M Y'),
            'next_prayer' => $nextPrayer,
            'wifi_name' => (string) SiteSetting::get('signage_wifi_name', ''),
            // Public payload never includes the password — PublicSignageController
            // injects it only for an approved device_id query param.
            'wifi_password' => '',
            'business_phone' => (string) SiteSetting::get('business_phone', ''),
            'business_website' => (string) SiteSetting::get('business_website', ''),
            'promotion_name' => '',
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function bestsellers(int $limit): array
    {
        if (!Schema::hasTable('items')) {
            return [];
        }

        try {
            // Sold in the last 30 days by the reports' own rule (a paid order at any stage, removed lines and
            // gift cards aside), counted in pieces, not order lines (TV audit, 2026-11-26: the slide counted a
            // saved ticket nobody paid, and filled up with dishes that had never sold).
            $items = Item::query()
                ->where('is_active', true)
                // An item kept out of the best sellers (owner, 2026-10-13) never makes the slide.
                ->where('hide_from_bestsellers', false)
                // Nor one that is not on sale yet.
                ->where(fn ($q) => $q->whereNull('launch_at')->orWhere('launch_at', '<=', now()))
                ->select([
                    'id', 'name', 'name_dv', 'base_price', 'image_url', 'thumb_url',
                    'image_webp_url', 'thumb_webp_url',
                    'category_id', 'short_description',
                ])
                ->selectSub(ItemSales::soldSubquery(), 'sales_30d')
                ->orderByDesc('sales_30d')
                ->orderBy('id')
                ->limit($limit)
                ->get()
                ->filter(fn (Item $i) => (float) ($i->sales_30d ?? 0) > 0)
                ->values();
        } catch (\Throwable) {
            return [];
        }

        return $items->map(fn (Item $i) => [
            'id' => $i->id,
            'name' => $i->name,
            'name_dv' => $i->name_dv,
            'base_price' => (float) $i->base_price,
            'image_url' => $i->image_url,
            'thumb_url' => $i->thumb_url,
            'image_webp_url' => $i->getAttribute('image_webp_url'),
            'thumb_webp_url' => $i->getAttribute('thumb_webp_url'),
            'category_id' => $i->category_id,
            'short_description' => $i->short_description,
            'sales_30d' => (int) round((float) ($i->sales_30d ?? 0)),
        ])->all();
    }
}
