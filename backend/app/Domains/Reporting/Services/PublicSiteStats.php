<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Content\Blocks\BlockDeviceSettings;
use App\Domains\Content\Blocks\PageBlockRepository;
use App\Domains\Reporting\Support\OrderTallies;
use App\Models\Customer;
use App\Models\PageBlock;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Public "social proof" counters, configured in the Customer Surface Builder:
 * each surface (website home, order-app home) shows counters only where the
 * owner placed a "Public counters" block, and that block's settings pick
 * which counters appear. Counters are separate (retail orders, wholesale,
 * catering/events, customers, visitors) — never combined.
 *
 * Nothing shows until the block is added to a layout. Displayed values are
 * rounded DOWN to a friendly step ("12,500+") so exact business figures are
 * never exposed; revenue is deliberately not offered here at all.
 */
class PublicSiteStats
{
    public const SURFACES = ['web', 'order'];

    public const BLOCK_TYPE = 'public_stats';

    /** key => public label. Order here is display order. */
    public const COUNTERS = [
        'orders' => 'Orders served',
        'wholesale' => 'Wholesale orders',
        'catering' => 'Events catered',
        'customers' => 'Happy customers',
        'visitors' => 'Visitors this month',
    ];

    private const CACHE_KEY = 'public_site_stats:values';

    private const CACHE_TTL = 600;

    /** API surface name → page_blocks app. */
    private const SURFACE_APPS = [
        'web' => PageBlock::APP_WEBSITE,
        'order' => PageBlock::APP_ORDER,
    ];

    /**
     * What this surface may show, straight from its home-page blocks.
     * Serves the order app (and any JS consumer); the website partial uses
     * statsForBlock() with the rendering block's own settings instead.
     *
     * @return array{enabled: bool, stats: list<array{key: string, label: string, value: int, display: string}>}
     */
    public function payload(string $surface): array
    {
        // Marketing counters must never take a public page down: any cache
        // or database failure degrades to "disabled".
        try {
            $app = self::SURFACE_APPS[$surface] ?? null;
            if ($app === null) {
                return ['enabled' => false, 'stats' => []];
            }

            $stats = $this->stats($this->enabledCounters($app));

            return ['enabled' => $stats !== [], 'stats' => $stats];
        } catch (\Throwable) {
            return ['enabled' => false, 'stats' => []];
        }
    }

    /**
     * Stats for one rendering block (website partial has $settings in scope).
     *
     * @param array<string, mixed> $settings
     * @return list<array{key: string, label: string, value: int, display: string}>
     */
    public function statsForBlock(array $settings): array
    {
        try {
            return $this->stats($this->countersFromSettings($settings));
        } catch (\Throwable) {
            return [];
        }
    }

    public static function bustCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * Counter keys enabled by the surface's public_stats block(s): the block
     * must be enabled and visible on at least one device. Missing show_*
     * keys count as ON (the block's registry defaults show everything).
     *
     * @return list<string>
     */
    private function enabledCounters(string $app): array
    {
        $keys = [];
        $blocks = PageBlockRepository::forPage($app)
            ->where('block_type', self::BLOCK_TYPE)
            ->where('is_enabled', true);

        foreach ($blocks as $block) {
            $settings = $block->resolvedSettings();
            if (!BlockDeviceSettings::showDesktop($settings) && !BlockDeviceSettings::showMobile($settings)) {
                continue;
            }
            $keys = array_merge($keys, $this->countersFromSettings($settings));
        }

        return array_values(array_unique($keys));
    }

    /**
     * @param array<string, mixed> $settings
     * @return list<string>
     */
    private function countersFromSettings(array $settings): array
    {
        $keys = [];
        foreach (array_keys(self::COUNTERS) as $key) {
            if (filter_var($settings["show_{$key}"] ?? true, FILTER_VALIDATE_BOOLEAN)) {
                $keys[] = $key;
            }
        }

        return $keys;
    }

    /**
     * Build display rows for the requested counters. Raw values are cached
     * in one shared key so both surfaces (and repeat requests) reuse them.
     *
     * @param list<string> $keys
     * @return list<array{key: string, label: string, value: int, display: string}>
     */
    private function stats(array $keys): array
    {
        if ($keys === []) {
            return [];
        }

        /** @var array<string, int> $values */
        $values = Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function (): array {
            $out = [];
            foreach (array_keys(self::COUNTERS) as $key) {
                $out[$key] = $this->value($key);
            }

            return $out;
        });

        $stats = [];
        foreach (self::COUNTERS as $key => $label) {
            if (!in_array($key, $keys, true)) {
                continue;
            }
            $value = (int) ($values[$key] ?? 0);
            // Zero counters would look worse than nothing — hide them.
            if ($value > 0) {
                $stats[] = [
                    'key' => $key,
                    'label' => $label,
                    'value' => $value,
                    'display' => $this->friendly($value),
                ];
            }
        }

        return $stats;
    }

    private function value(string $key): int
    {
        return match ($key) {
            'orders' => OrderTallies::retail(),
            'wholesale' => OrderTallies::wholesale(),
            'catering' => OrderTallies::catering(),
            'customers' => Customer::count(),
            'visitors' => (int) DB::table('site_visits_daily')
                ->where('date', '>=', now(config('app.timezone', 'Indian/Maldives'))->subDays(29)->toDateString())
                ->sum('uniques'),
            default => 0,
        };
    }

    /** Round DOWN to a marketing-friendly step; "+" marks the rounding. */
    private function friendly(int $value): string
    {
        $step = match (true) {
            $value >= 10000 => 500,
            $value >= 1000 => 100,
            $value >= 100 => 10,
            default => 1,
        };
        $rounded = intdiv($value, $step) * $step;

        return number_format($rounded) . ($rounded < $value ? '+' : '');
    }
}
