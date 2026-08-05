<?php

declare(strict_types=1);

namespace App\Domains\Signage\Services;

use App\Domains\PrayerTimes\Actions\GetIslandCollection;
use App\Domains\PrayerTimes\Actions\GetPrayerTimesForIslandAndDate;
use App\Domains\PrayerTimes\DTOs\IslandData;
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

        return SignageCache::remember($cacheKey, 30, function () use ($screenKey, $now, $storeId, $version) {
            return $this->resolveFresh($screenKey, $now, $storeId, $version);
        });
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

        $rotation = WeightedRotation::buildOrder($slides);
        $prayer = $this->prayerPayload($now);

        return [
            'screen' => $screen ? [
                'id' => $screen->id,
                'name' => $screen->name,
                'slug' => $screen->slug,
                'group_id' => $screen->group_id,
            ] : null,
            'playlist_id' => $playlistId,
            'playlist_version' => $version,
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
            'banner' => $this->bannerConfig(),
            'bestsellers' => $this->bestsellers(8),
            'menu_new_days' => (int) SiteSetting::get('menu_new_days', 30),
            'templates' => SignageTemplateFactory::templateCatalog(),
            'server_time' => $now->toIso8601String(),
        ];
    }

    private function findScreen(?string $key): ?SignageScreen
    {
        $q = SignageScreen::query()->with(['group.playlist', 'playlist']);
        if ($key === null || $key === '' || $key === 'default') {
            return $q->where('is_default', true)->first()
                ?? $q->where('slug', 'default')->first()
                ?? $q->orderBy('id')->first();
        }
        if (ctype_digit($key)) {
            return $q->where('id', (int) $key)->first()
                ?? $q->where('slug', $key)->first();
        }

        return $q->where('slug', $key)->first();
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
            if (! $this->campaignMatches($campaign, $now)) {
                continue;
            }

            return $campaign;
        }

        return null;
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
            if (! ($entry['is_active'] ?? false)) {
                continue;
            }
            $schedule = is_array($entry['schedule'] ?? null) ? $entry['schedule'] : [];
            if ($schedule !== [] && ! SignageScheduleMatcher::matches($schedule, $now)) {
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
        if (! ($cfg['enabled'] ?? false)) {
            return false;
        }
        $breakMinutes = max(1, (int) ($cfg['break_minutes'] ?? 15));
        $prayers = array_values(array_filter(array_map('strval', $cfg['prayers'] ?? ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'])));

        $island = $this->resolvePrayerIsland();
        if (! $island instanceof IslandData) {
            return false;
        }
        try {
            $result = $this->prayerTimes->execute($island, $now->copy()->startOfDay());
            if (! $result) {
                return false;
            }
            $map = $result->prayersOnly();
            $nowMin = ((int) $now->format('H')) * 60 + (int) $now->format('i');
            foreach ($prayers as $name) {
                $t = $map[$name] ?? null;
                if (! is_string($t) || ! preg_match('/^\d{1,2}:\d{2}/', $t)) {
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
        if (! $island instanceof IslandData) {
            return ['next_prayer' => '', 'schedule' => []];
        }

        try {
            $result = $this->prayerTimes->execute($island, $now->copy()->startOfDay());
            if (! $result) {
                return ['next_prayer' => '', 'schedule' => []];
            }
            $nowMin = ((int) $now->format('H')) * 60 + (int) $now->format('i');
            foreach ($result->prayersOnly() as $name => $t) {
                if (! is_string($t) || ! preg_match('/^\d{1,2}:\d{2}/', $t)) {
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
            'wifi_password' => (string) SiteSetting::get('signage_wifi_password', ''),
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
        if (! Schema::hasTable('items')) {
            return [];
        }

        $q = Item::query()->where('is_active', true);
        if (Schema::hasColumn('items', 'is_available')) {
            // keep available when column exists — not required
        }

        try {
            $items = Item::query()
                ->where(function ($qq) {
                    $qq->where('is_active', true);
                })
                ->withCount(['orderItems as sales_30d' => function ($q) {
                    $q->whereHas('order', function ($order) {
                        $order->where('status', '!=', 'cancelled')
                            ->where('created_at', '>=', now()->subDays(30));
                    });
                }])
                ->orderByDesc('sales_30d')
                ->limit($limit)
                ->get([
                    'id', 'name', 'base_price', 'image_url', 'thumb_url',
                    'image_webp_url', 'thumb_webp_url',
                    'category_id', 'short_description',
                ]);
        } catch (\Throwable) {
            return [];
        }

        return $items->map(fn (Item $i) => [
            'id' => $i->id,
            'name' => $i->name,
            'base_price' => (float) $i->base_price,
            'image_url' => $i->image_url,
            'thumb_url' => $i->thumb_url,
            'image_webp_url' => $i->getAttribute('image_webp_url'),
            'thumb_webp_url' => $i->getAttribute('thumb_webp_url'),
            'category_id' => $i->category_id,
            'short_description' => $i->short_description,
            'sales_30d' => (int) ($i->sales_30d ?? 0),
        ])->all();
    }
}
