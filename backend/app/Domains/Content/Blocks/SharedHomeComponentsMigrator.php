<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Models\PageBlock;
use App\Models\PageLayoutDraft;
use App\Models\SiteSetting;
use Illuminate\Support\Facades\DB;

/**
 * Upgrade live (and draft) Home layouts so previously injected / app-locked
 * chrome becomes explicit page_blocks. Idempotent. Does not wipe custom order.
 */
final class SharedHomeComponentsMigrator
{
    /**
     * @return array{website: int, order_app: int, drafts: int}
     */
    public static function migrate(): array
    {
        return DB::transaction(function () {
            $website = self::upgradeApp(PageBlock::APP_WEBSITE);
            $order = self::upgradeApp(PageBlock::APP_ORDER);
            $drafts = self::upgradeDrafts();
            PageBlockRepository::bustAll();

            return ['website' => $website, 'order_app' => $order, 'drafts' => $drafts];
        });
    }

    public static function upgradeApp(string $app): int
    {
        $rows = PageBlock::query()
            ->where('app', $app)
            ->where('page', PageBlock::PAGE_HOME)
            ->orderBy('position')
            ->orderBy('id')
            ->get();

        if ($rows->isEmpty()) {
            // Fresh installs that only ran Stage B migrator already have rows.
            // Empty means reverse/unmigrated — leave alone.
            return 0;
        }

        $list = $rows->map(fn (PageBlock $b) => [
            'id' => $b->id,
            'block_type' => $b->block_type,
            'position' => (int) $b->position,
            'is_enabled' => (bool) $b->is_enabled,
            'content_mode' => $b->content_mode,
            'shared_content_id' => $b->shared_content_id,
            'settings' => is_array($b->settings) ? $b->settings : [],
        ])->values()->all();

        $list = self::mergePromoIntoHero($list);
        $list = self::ensurePrayerSettings($app, $list);
        $list = self::insertMissing($app, $list);

        // Rewrite positions; update existing / create new / delete merged promo leftovers.
        $keepIds = [];
        foreach ($list as $i => $row) {
            $settings = $row['settings'];
            $type = $row['block_type'];
            $def = BlockTypeRegistry::get($type);
            if ($def === null) {
                continue;
            }

            if ($row['id'] !== null) {
                PageBlock::query()->whereKey($row['id'])->update([
                    'block_type' => $type,
                    'position' => $i,
                    'is_enabled' => $row['is_enabled'],
                    'content_mode' => $row['content_mode'],
                    'settings' => $settings,
                ]);
                $keepIds[] = $row['id'];
            } else {
                $created = PageBlock::create([
                    'app' => $app,
                    'page' => PageBlock::PAGE_HOME,
                    'block_type' => $type,
                    'position' => $i,
                    'is_enabled' => $row['is_enabled'],
                    'content_mode' => $def->supportsSharedContent
                        ? PageBlock::MODE_SHARED
                        : PageBlock::MODE_OWN,
                    'settings' => $settings,
                ]);
                $keepIds[] = $created->id;
            }
        }

        PageBlock::query()
            ->where('app', $app)
            ->where('page', PageBlock::PAGE_HOME)
            ->whereNotIn('id', $keepIds)
            ->delete();

        return count($keepIds);
    }

    private static function upgradeDrafts(): int
    {
        $count = 0;
        $drafts = PageLayoutDraft::query()->get();
        foreach ($drafts as $draft) {
            $payload = is_array($draft->payload) ? $draft->payload : [];
            $blocks = $payload['blocks'] ?? null;
            if (! is_array($blocks) || $blocks === []) {
                continue;
            }

            $list = [];
            foreach ($blocks as $row) {
                if (! is_array($row)) {
                    continue;
                }
                $list[] = [
                    'id' => isset($row['id']) ? (int) $row['id'] : null,
                    'block_type' => (string) ($row['block_type'] ?? ''),
                    'position' => (int) ($row['position'] ?? 0),
                    'is_enabled' => (bool) ($row['is_enabled'] ?? true),
                    'content_mode' => (string) ($row['content_mode'] ?? PageBlock::MODE_OWN),
                    'shared_content_id' => $row['shared_content_id'] ?? null,
                    'settings' => is_array($row['settings'] ?? null) ? $row['settings'] : [],
                ];
            }

            $app = (string) $draft->app;
            $list = self::mergePromoIntoHero($list);
            $list = self::ensurePrayerSettings($app, $list);
            $list = self::insertMissing($app, $list);

            $serialized = [];
            foreach ($list as $i => $row) {
                if ($row['block_type'] === '' || ! BlockTypeRegistry::isKnown($row['block_type'])) {
                    continue;
                }
                $serialized[] = array_merge($row, ['position' => $i, 'app' => $app, 'page' => 'home']);
            }

            $draft->payload = ['blocks' => $serialized];
            $draft->save();
            $count++;
        }

        return $count;
    }

    /**
     * @param  list<array<string, mixed>>  $list
     * @return list<array<string, mixed>>
     */
    private static function mergePromoIntoHero(array $list): array
    {
        $heroIdx = null;
        $promoIdxs = [];
        foreach ($list as $i => $row) {
            if ($row['block_type'] === 'hero') {
                $heroIdx = $i;
            }
            if ($row['block_type'] === 'promo_carousel') {
                $promoIdxs[] = $i;
            }
        }

        if ($promoIdxs === []) {
            return $list;
        }

        if ($heroIdx === null) {
            // Promote first promo to hero; drop the rest.
            $first = $promoIdxs[0];
            $list[$first]['block_type'] = 'hero';
            $drop = array_slice($promoIdxs, 1);
        } else {
            $drop = $promoIdxs;
        }

        foreach (array_reverse($drop) as $i) {
            unset($list[$i]);
        }

        return array_values($list);
    }

    /**
     * @param  list<array<string, mixed>>  $list
     * @return list<array<string, mixed>>
     */
    private static function ensurePrayerSettings(string $app, array $list): array
    {
        $defaults = BlockDeviceSettings::prayerDefaults($app);
        foreach ($list as $i => $row) {
            if ($row['block_type'] !== 'prayer_bar') {
                continue;
            }
            $list[$i]['settings'] = array_merge($defaults, $row['settings']);
        }

        return $list;
    }

    /**
     * @param  list<array<string, mixed>>  $list
     * @return list<array<string, mixed>>
     */
    private static function insertMissing(string $app, array $list): array
    {
        $types = array_column($list, 'block_type');
        $has = static fn (string $t): bool => in_array($t, $types, true);

        $insertAfter = static function (array &$list, string $afterType, array $row) use (&$types): void {
            if (in_array($row['block_type'], $types, true)) {
                return;
            }
            $idx = array_search($afterType, array_column($list, 'block_type'), true);
            $row['id'] = null;
            if ($idx === false) {
                $list[] = $row;
            } else {
                array_splice($list, $idx + 1, 0, [$row]);
            }
            $types = array_column($list, 'block_type');
        };

        $prepend = static function (array &$list, array $row) use (&$types): void {
            if (in_array($row['block_type'], $types, true)) {
                return;
            }
            $row['id'] = null;
            array_unshift($list, $row);
            $types = array_column($list, 'block_type');
        };

        $append = static function (array &$list, array $row) use (&$types): void {
            if (in_array($row['block_type'], $types, true)) {
                return;
            }
            $row['id'] = null;
            $list[] = $row;
            $types = array_column($list, 'block_type');
        };

        $new = static function (string $type, bool $enabled = true, array $settings = []) use ($app): array {
            $def = BlockTypeRegistry::get($type);
            $defaults = $def?->settingsDefaults ?? BlockDeviceSettings::DEFAULTS;
            if ($type === 'prayer_bar') {
                $defaults = BlockDeviceSettings::prayerDefaults($app);
            }
            if ($type === 'announcement') {
                $defaults = BlockDeviceSettings::announcementDefaults();
            }

            return [
                'id' => null,
                'block_type' => $type,
                'position' => 0,
                'is_enabled' => $enabled,
                'content_mode' => ($def?->supportsSharedContent ?? false)
                    ? PageBlock::MODE_SHARED
                    : PageBlock::MODE_OWN,
                'shared_content_id' => null,
                'settings' => array_merge($defaults, $settings),
            ];
        };

        if ($app === PageBlock::APP_WEBSITE) {
            if (! $has('prayer_bar')) {
                $prepend($list, $new('prayer_bar', true));
            }
            $annOn = self::truthySetting('announcement_enabled');
            if ($annOn && ! $has('announcement')) {
                $insertAfter($list, 'prayer_bar', $new('announcement', true));
            }
            if ($has('hero') && ! $has('trust_strip')) {
                $insertAfter($list, 'hero', $new('trust_strip', true));
            } elseif (! $has('hero') && ! $has('trust_strip')) {
                $prepend($list, $new('trust_strip', true));
            }
            if (! $has('events_band')) {
                $append($list, $new('events_band', true));
            }
            if (! $has('brand_footer')) {
                $append($list, $new('brand_footer', true));
            }
        }

        if ($app === PageBlock::APP_ORDER) {
            // Phone logo + login render inside the greeting chrome — keep it present.
            if (! $has('greeting')) {
                $prepend($list, $new('greeting', true));
            }
            if (! $has('prayer_bar')) {
                $insertAfter($list, 'greeting', $new('prayer_bar', true));
                if (! $has('prayer_bar')) {
                    $prepend($list, $new('prayer_bar', true));
                }
            }
            $annOn = self::truthySetting('announcement_enabled');
            if ($annOn && ! $has('announcement')) {
                $insertAfter($list, 'prayer_bar', $new('announcement', true));
            }
            if (! $has('stat_chips')) {
                // Historical: chips near hero.
                if ($has('hero')) {
                    // phone: before hero; insert before hero index
                    $heroIdx = array_search('hero', array_column($list, 'block_type'), true);
                    if ($heroIdx !== false && ! $has('stat_chips')) {
                        $row = $new('stat_chips', true);
                        $row['id'] = null;
                        array_splice($list, (int) $heroIdx, 0, [$row]);
                        $types = array_column($list, 'block_type');
                    }
                } else {
                    $insertAfter($list, 'opening_status', $new('stat_chips', true));
                }
            }
            if ($has('mode_cards') && ! $has('trust_strip')) {
                $insertAfter($list, 'mode_cards', $new('trust_strip', true));
            }
            $officeOn = self::truthySetting('office_orders_enabled', default: true);
            if ($officeOn && ! $has('office_orders')) {
                if ($has('reorder_strip')) {
                    $insertAfter($list, 'reorder_strip', $new('office_orders', true));
                } elseif ($has('brand_footer')) {
                    $bf = array_search('brand_footer', array_column($list, 'block_type'), true);
                    $row = $new('office_orders', true);
                    $row['id'] = null;
                    array_splice($list, (int) $bf, 0, [$row]);
                    $types = array_column($list, 'block_type');
                } else {
                    $append($list, $new('office_orders', true));
                }
            }
        }

        return array_values($list);
    }

    private static function truthySetting(string $key, bool $default = false): bool
    {
        foreach (['shared', 'website', 'order_app'] as $scope) {
            $raw = SiteSetting::getScoped($key, $scope, 'en');
            if ($raw === null || $raw === '') {
                continue;
            }
            if (is_bool($raw)) {
                return $raw;
            }

            return ! in_array(strtolower(trim((string) $raw)), ['false', '0', 'no', 'off'], true);
        }

        return $default;
    }
}
