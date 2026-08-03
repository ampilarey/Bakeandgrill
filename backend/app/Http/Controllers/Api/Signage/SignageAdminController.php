<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Signage;

use App\Domains\PrayerTimes\Actions\GetIslandCollection;
use App\Domains\Signage\Services\SignageBannerNormalizer;
use App\Domains\Signage\Services\SignageCache;
use App\Domains\Signage\Services\SignageEmergencyNormalizer;
use App\Domains\Signage\Services\SignageTemplateFactory;
use App\Http\Controllers\Controller;
use App\Models\SignageCampaign;
use App\Models\SignageGroup;
use App\Models\SignagePlaylist;
use App\Models\SignageScreen;
use App\Models\SiteSetting;
use App\Services\AuditLogService;
use App\Support\PrayerTimeHelper;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

final class SignageAdminController extends Controller
{
    public function __construct(
        private readonly AuditLogService $audit,
        private readonly GetIslandCollection $islands,
    ) {}

    public function overview(): JsonResponse
    {
        return response()->json([
            'playlists' => SignagePlaylist::query()->orderBy('name')->get(),
            'groups' => SignageGroup::query()->with('playlist:id,name')->orderBy('name')->get(),
            'screens' => SignageScreen::query()->with(['group:id,name', 'playlist:id,name'])->orderBy('name')->get(),
            'campaigns' => SignageCampaign::query()->with('playlist:id,name')->orderByDesc('priority')->get(),
            'emergency' => $this->emergencyConfig(),
            'prayer' => $this->prayerConfig(),
            'prayer_islands' => $this->prayerIslandOptions(),
            'banner' => $this->bannerConfig(),
            'templates' => SignageTemplateFactory::templateCatalog(),
            'custom_templates' => $this->customTemplates(),
            'wifi' => [
                'name' => (string) SiteSetting::get('signage_wifi_name', ''),
                'password' => (string) SiteSetting::get('signage_wifi_password', ''),
            ],
        ]);
    }

    // ── Playlists ────────────────────────────────────────────────────────────

    public function storePlaylist(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'slides' => 'nullable|array',
            'theme' => 'nullable|array',
            'is_active' => 'sometimes|boolean',
            'store_id' => 'nullable|integer',
        ]);
        $row = SignagePlaylist::create([
            'name' => $data['name'],
            'slides' => $data['slides'] ?? [],
            'theme' => $data['theme'] ?? [],
            'is_active' => $data['is_active'] ?? true,
            'store_id' => $data['store_id'] ?? null,
        ]);
        $this->touch($request, 'signage.playlist.created', $row->id, [], $row->toArray());

        return response()->json(['data' => $row], 201);
    }

    public function updatePlaylist(Request $request, int $id): JsonResponse
    {
        $row = SignagePlaylist::query()->findOrFail($id);
        $old = $row->toArray();
        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'slides' => 'nullable|array',
            'theme' => 'nullable|array',
            'is_active' => 'sometimes|boolean',
            'store_id' => 'nullable|integer',
        ]);
        $row->fill($data)->save();
        $this->touch($request, 'signage.playlist.updated', $row->id, $old, $row->toArray());

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroyPlaylist(Request $request, int $id): JsonResponse
    {
        $row = SignagePlaylist::query()->findOrFail($id);
        $old = $row->toArray();
        $row->delete();
        $this->touch($request, 'signage.playlist.deleted', $id, $old, []);

        return response()->json(['ok' => true]);
    }

    // ── Groups ───────────────────────────────────────────────────────────────

    public function storeGroup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'playlist_id' => 'nullable|integer|exists:signage_playlists,id',
            'theme' => 'nullable|array',
            'orientation' => 'nullable|string|in:landscape,portrait',
            'refresh_seconds' => 'nullable|integer|min:15|max:3600',
            'store_id' => 'nullable|integer',
        ]);
        $row = SignageGroup::create($data);
        $this->touch($request, 'signage.group.created', $row->id, [], $row->toArray());

        return response()->json(['data' => $row], 201);
    }

    public function updateGroup(Request $request, int $id): JsonResponse
    {
        $row = SignageGroup::query()->findOrFail($id);
        $old = $row->toArray();
        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'playlist_id' => 'nullable|integer|exists:signage_playlists,id',
            'theme' => 'nullable|array',
            'orientation' => 'nullable|string|in:landscape,portrait',
            'refresh_seconds' => 'nullable|integer|min:15|max:3600',
            'store_id' => 'nullable|integer',
        ]);
        $row->fill($data)->save();
        $this->touch($request, 'signage.group.updated', $row->id, $old, $row->toArray());

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroyGroup(Request $request, int $id): JsonResponse
    {
        $row = SignageGroup::query()->findOrFail($id);
        $old = $row->toArray();
        $row->delete();
        $this->touch($request, 'signage.group.deleted', $id, $old, []);

        return response()->json(['ok' => true]);
    }

    // ── Screens ──────────────────────────────────────────────────────────────

    public function storeScreen(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'slug' => 'nullable|string|max:80|unique:signage_screens,slug',
            'group_id' => 'nullable|integer|exists:signage_groups,id',
            'playlist_id' => 'nullable|integer|exists:signage_playlists,id',
            'orientation' => 'nullable|string|in:landscape,portrait',
            'resolution' => 'nullable|string|max:32',
            'refresh_seconds' => 'nullable|integer|min:15|max:3600',
            'fallback' => 'nullable|array',
            'overrides' => 'nullable|array',
            'is_default' => 'sometimes|boolean',
            'store_id' => 'nullable|integer',
        ]);
        $data['slug'] = $data['slug'] ?? Str::slug($data['name']);
        if (! empty($data['is_default'])) {
            SignageScreen::query()->where('is_default', true)->update(['is_default' => false]);
        }
        $row = SignageScreen::create($data);
        $this->touch($request, 'signage.screen.created', $row->id, [], $row->toArray());

        return response()->json(['data' => $row], 201);
    }

    public function updateScreen(Request $request, int $id): JsonResponse
    {
        $row = SignageScreen::query()->findOrFail($id);
        $old = $row->toArray();
        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'slug' => ['sometimes', 'string', 'max:80', Rule::unique('signage_screens', 'slug')->ignore($row->id)],
            'group_id' => 'nullable|integer|exists:signage_groups,id',
            'playlist_id' => 'nullable|integer|exists:signage_playlists,id',
            'orientation' => 'nullable|string|in:landscape,portrait',
            'resolution' => 'nullable|string|max:32',
            'refresh_seconds' => 'nullable|integer|min:15|max:3600',
            'fallback' => 'nullable|array',
            'overrides' => 'nullable|array',
            'is_default' => 'sometimes|boolean',
            'store_id' => 'nullable|integer',
        ]);
        if (! empty($data['is_default'])) {
            SignageScreen::query()->where('is_default', true)->where('id', '!=', $row->id)->update(['is_default' => false]);
        }
        $row->fill($data)->save();
        $this->touch($request, 'signage.screen.updated', $row->id, $old, $row->toArray());

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroyScreen(Request $request, int $id): JsonResponse
    {
        $row = SignageScreen::query()->findOrFail($id);
        $old = $row->toArray();
        $row->delete();
        $this->touch($request, 'signage.screen.deleted', $id, $old, []);

        return response()->json(['ok' => true]);
    }

    // ── Campaigns ────────────────────────────────────────────────────────────

    public function storeCampaign(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'playlist_id' => 'nullable|integer|exists:signage_playlists,id',
            'slides' => 'nullable|array',
            'date_start' => 'nullable|date',
            'date_end' => 'nullable|date|after_or_equal:date_start',
            'days' => 'nullable|array',
            'windows' => 'nullable|array',
            'priority' => 'nullable|integer|min:0|max:9999',
            'is_active' => 'sometimes|boolean',
            'store_id' => 'nullable|integer',
        ]);
        $row = SignageCampaign::create($data);
        $this->touch($request, 'signage.campaign.created', $row->id, [], $row->toArray());

        return response()->json(['data' => $row], 201);
    }

    public function updateCampaign(Request $request, int $id): JsonResponse
    {
        $row = SignageCampaign::query()->findOrFail($id);
        $old = $row->toArray();
        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'playlist_id' => 'nullable|integer|exists:signage_playlists,id',
            'slides' => 'nullable|array',
            'date_start' => 'nullable|date',
            'date_end' => 'nullable|date',
            'days' => 'nullable|array',
            'windows' => 'nullable|array',
            'priority' => 'nullable|integer|min:0|max:9999',
            'is_active' => 'sometimes|boolean',
            'store_id' => 'nullable|integer',
        ]);
        $row->fill($data)->save();
        $this->touch($request, 'signage.campaign.updated', $row->id, $old, $row->toArray());

        return response()->json(['data' => $row->fresh()]);
    }

    public function destroyCampaign(Request $request, int $id): JsonResponse
    {
        $row = SignageCampaign::query()->findOrFail($id);
        $old = $row->toArray();
        $row->delete();
        $this->touch($request, 'signage.campaign.deleted', $id, $old, []);

        return response()->json(['ok' => true]);
    }

    // ── Emergency / prayer / templates ───────────────────────────────────────

    public function updateEmergency(Request $request): JsonResponse
    {
        $modes = implode(',', SignageEmergencyNormalizer::MODES);
        $layouts = implode(',', SignageEmergencyNormalizer::LAYOUTS);
        $data = $request->validate([
            'mode' => 'sometimes|string|in:'.$modes,
            'entries' => 'sometimes|array',
            'entries.*.id' => 'nullable|string|max:80',
            'entries.*.mode' => 'required_with:entries|string|in:'.implode(',', array_filter(
                SignageEmergencyNormalizer::MODES,
                fn (string $m) => $m !== 'none'
            )),
            'entries.*.priority' => 'nullable|integer|min:0|max:9999',
            'entries.*.is_active' => 'nullable|boolean',
            'entries.*.layout' => 'nullable|string|in:'.$layouts,
            'entries.*.title' => 'nullable|string|max:200',
            'entries.*.body' => 'nullable|string|max:500',
            'entries.*.title_dv' => 'nullable|string|max:200',
            'entries.*.body_dv' => 'nullable|string|max:500',
            'entries.*.reopen_at' => 'nullable|string|max:40',
            'entries.*.schedule' => 'nullable|array',
            'entries.*.schedule.date_start' => 'nullable|date',
            'entries.*.schedule.date_end' => 'nullable|date',
            'entries.*.schedule.days' => 'nullable|array',
            'entries.*.schedule.windows' => 'nullable|array',
        ]);

        if (! isset($data['mode']) && ! isset($data['entries'])) {
            return response()->json(['message' => 'Provide mode and/or entries.'], 422);
        }

        $old = $this->emergencyConfig();
        $current = $old;

        if (isset($data['mode'])) {
            SiteSetting::set('signage_emergency', $data['mode']);
            $current['manual'] = $data['mode'];
        }

        if (isset($data['entries'])) {
            $normalized = SignageEmergencyNormalizer::normalize(
                (string) ($current['manual'] ?? 'none'),
                ['entries' => $data['entries']]
            );
            SiteSetting::set('signage_emergency_entries', ['entries' => $normalized['entries']]);
            $current['entries'] = $normalized['entries'];
        }

        SiteSetting::bust();
        $this->touch($request, 'signage.emergency.updated', null, $old, $current);
        SignageCache::bust();

        return response()->json($current);
    }

    public function updatePrayer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => 'required|boolean',
            'prayers' => 'nullable|array',
            'prayers.*' => 'string|in:fajr,dhuhr,asr,maghrib,isha',
            'break_minutes' => 'nullable|integer|min:1|max:60',
            'island_id' => 'nullable|integer|min:1|exists:prayer_islands,id',
        ]);
        $old = $this->prayerConfig();
        $cfg = [
            'enabled' => (bool) $data['enabled'],
            'prayers' => $data['prayers'] ?? $old['prayers'],
            'break_minutes' => (int) ($data['break_minutes'] ?? $old['break_minutes']),
            'island_id' => isset($data['island_id'])
                ? (int) $data['island_id']
                : (int) ($old['island_id'] ?? PrayerTimeHelper::MALE_ISLAND_FALLBACK_ID),
        ];
        SiteSetting::set('signage_prayer', [
            'enabled' => $cfg['enabled'],
            'prayers' => $cfg['prayers'],
            'break_minutes' => $cfg['break_minutes'],
        ]);
        SiteSetting::set('signage_prayer_island_id', (string) $cfg['island_id']);
        SiteSetting::bust();
        $this->touch($request, 'signage.prayer.updated', null, $old, $cfg);
        SignageCache::bust();

        return response()->json(['prayer' => $cfg]);
    }

    public function updateBanner(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => 'required|boolean',
            'show_logo_between' => 'nullable|boolean',
            'banners' => 'nullable|array',
            'banners.*.id' => 'nullable|string|max:80',
            'banners.*.label' => 'nullable|string|max:120',
            'banners.*.enabled' => 'nullable|boolean',
            'banners.*.position' => 'nullable|string|in:top,bottom',
            'banners.*.fields' => 'nullable|array',
            'banners.*.fields.*' => 'string|in:date,time,next_prayer,countdown',
            'banners.*.custom_text' => 'nullable|string|max:500',
            'banners.*.speed_seconds' => 'nullable|integer|min:10|max:180',
            'banners.*.duration_seconds' => 'nullable|integer|min:5|max:600',
            'banners.*.repeat_count' => 'nullable|integer|min:1|max:20',
            'banners.*.font_scale' => 'nullable|numeric|min:0.5|max:3',
            'banners.*.height_scale' => 'nullable|numeric|min:0.5|max:3',
            'banners.*.text_color' => 'nullable|string|max:80',
            'banners.*.background_color' => 'nullable|string|max:80',
            'banners.*.align' => 'nullable|string|in:left,center,right',
            'banners.*.scroll_mode' => 'nullable|string|in:ticker,seamless,static',
            'banners.*.direction' => 'nullable|string|in:ltr,rtl',
            'banners.*.scroll' => 'nullable|boolean',
            'banners.*.date_format' => 'nullable|string|in:full,short,numeric,weekday,hijri',
            'banners.*.inset_percent' => 'nullable|numeric|min:0|max:5',
            'banners.*.schedule' => 'nullable|array',
            'banners.*.schedule.date_start' => 'nullable|date',
            'banners.*.schedule.date_end' => 'nullable|date',
            'banners.*.schedule.days' => 'nullable|array',
            'banners.*.schedule.windows' => 'nullable|array',
            // Legacy Stage-3 single-banner fields still accepted.
            'position' => 'nullable|string|in:top,bottom',
            'fields' => 'nullable|array',
            'fields.*' => 'string|in:date,time,next_prayer,countdown',
            'speed_seconds' => 'nullable|integer|min:10|max:180',
        ]);
        $old = $this->bannerConfig();

        if (isset($data['banners']) && is_array($data['banners'])) {
            $cfg = SignageBannerNormalizer::normalize([
                'enabled' => (bool) $data['enabled'],
                'show_logo_between' => (bool) ($data['show_logo_between'] ?? false),
                'banners' => $data['banners'],
            ]);
        } else {
            $cfg = SignageBannerNormalizer::normalize([
                'enabled' => (bool) $data['enabled'],
                'show_logo_between' => (bool) ($data['show_logo_between'] ?? $old['show_logo_between'] ?? false),
                'position' => $data['position'] ?? ($old['banners'][0]['position'] ?? 'bottom'),
                'fields' => $data['fields'] ?? ($old['banners'][0]['fields'] ?? ['date', 'time', 'next_prayer', 'countdown']),
                'speed_seconds' => $data['speed_seconds'] ?? ($old['banners'][0]['speed_seconds'] ?? 40),
            ]);
        }

        SiteSetting::set('signage_banner', $cfg);
        SiteSetting::bust();
        $this->touch($request, 'signage.banner.updated', null, $old, $cfg);
        SignageCache::bust();

        return response()->json(['banner' => $cfg]);
    }

    public function saveCustomTemplate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => 'required|string|max:80',
            'label' => 'required|string|max:120',
            'slide' => 'required|array',
        ]);
        $templates = $this->customTemplates();
        $templates[$data['key']] = [
            'key' => $data['key'],
            'label' => $data['label'],
            'slide' => $data['slide'],
        ];
        SiteSetting::set('signage_custom_templates', $templates);
        SiteSetting::bust();
        $this->touch($request, 'signage.template.saved', null, [], ['key' => $data['key']]);
        SignageCache::bust();

        return response()->json(['templates' => array_values($templates)]);
    }

    public function buildTemplate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key' => 'required|string|max:80',
            'opts' => 'nullable|array',
        ]);
        $key = $data['key'];
        $opts = $data['opts'] ?? [];
        if (str_starts_with($key, 'smart:')) {
            $slide = SignageTemplateFactory::smartSlide(substr($key, 6), $opts);
        } else {
            $custom = $this->customTemplates()[$key] ?? null;
            if ($custom) {
                $slide = $custom['slide'];
            } else {
                $slide = SignageTemplateFactory::template($key, $opts);
            }
        }

        return response()->json(['slide' => $slide]);
    }

    /**
     * @return array{enabled: bool, prayers: list<string>, break_minutes: int, island_id: int}
     */
    private function prayerConfig(): array
    {
        $raw = SiteSetting::get('signage_prayer', '{}');
        $cfg = is_string($raw) ? (json_decode($raw, true) ?: []) : (is_array($raw) ? $raw : []);
        $islandId = (int) SiteSetting::get(
            'signage_prayer_island_id',
            (string) PrayerTimeHelper::MALE_ISLAND_FALLBACK_ID
        );
        if ($islandId <= 0) {
            $islandId = PrayerTimeHelper::MALE_ISLAND_FALLBACK_ID;
        }

        return [
            'enabled' => (bool) ($cfg['enabled'] ?? true),
            'prayers' => array_values($cfg['prayers'] ?? ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']),
            'break_minutes' => (int) ($cfg['break_minutes'] ?? 15),
            'island_id' => $islandId,
        ];
    }

    /**
     * @return list<array{id: int, label: string, atoll: string}>
     */
    private function prayerIslandOptions(): array
    {
        try {
            return $this->islands->execute()
                ->map(fn ($island) => [
                    'id' => $island->id,
                    'label' => $island->nameLatin
                        ? trim($island->atollLatin ? "{$island->atollLatin} · {$island->nameLatin}" : (string) $island->nameLatin)
                        : $island->displayName(),
                    'atoll' => (string) ($island->atollLatin ?: $island->atoll),
                ])
                ->values()
                ->all();
        } catch (\Throwable) {
            return [];
        }
    }

    /** @return array{manual: string, entries: list<array<string, mixed>>} */
    private function emergencyConfig(): array
    {
        return SignageEmergencyNormalizer::normalizeFromSettings();
    }

    /** @return array{enabled: bool, show_logo_between: bool, banners: list<array<string, mixed>>} */
    private function bannerConfig(): array
    {
        return SignageBannerNormalizer::normalize(SiteSetting::get('signage_banner', '{}'));
    }

    /** @return array<string, array<string, mixed>> */
    private function customTemplates(): array
    {
        $raw = SiteSetting::get('signage_custom_templates', '{}');
        $cfg = is_string($raw) ? (json_decode($raw, true) ?: []) : (is_array($raw) ? $raw : []);

        return is_array($cfg) ? $cfg : [];
    }

    /** @param array<string, mixed> $old @param array<string, mixed> $new */
    private function touch(Request $request, string $action, ?int $id, array $old, array $new): void
    {
        $this->audit->log($action, 'signage', $id, $old, $new, [], $request);
        SignageCache::bust();
    }
}
