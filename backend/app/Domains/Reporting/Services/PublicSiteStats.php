<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Reporting\Support\OrderTallies;
use App\Models\Customer;
use App\Models\SiteSetting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Public "social proof" counters, managed PER SURFACE: the website and the
 * order app each have their own master switch and per-counter toggles, so
 * the two can show different sets. Counters are separate (retail orders,
 * wholesale, catering/events, customers, visitors) — never combined.
 *
 * Everything is OFF by default. Displayed values are rounded DOWN to a
 * friendly step ("12,500+") so exact business figures are never exposed;
 * revenue is deliberately not offered here at all.
 */
class PublicSiteStats
{
    public const SURFACES = ['web', 'order'];

    /** key => public label. Order here is display order. */
    public const COUNTERS = [
        'orders' => 'Orders served',
        'wholesale' => 'Wholesale orders',
        'catering' => 'Events catered',
        'customers' => 'Happy customers',
        'visitors' => 'Visitors this month',
    ];

    private const CACHE_TTL = 600;

    private function cacheKey(string $surface): string
    {
        return 'public_site_stats:payload:' . $surface;
    }

    /** @return array{enabled: bool, counters: array<string, bool>} */
    public function settings(string $surface): array
    {
        $flag = fn (string $key) => filter_var(SiteSetting::get($key, '0'), FILTER_VALIDATE_BOOLEAN);

        $counters = [];
        foreach (array_keys(self::COUNTERS) as $key) {
            $counters[$key] = $flag("public_stats_{$surface}_show_{$key}");
        }

        return [
            'enabled' => $flag("public_stats_{$surface}_enabled"),
            'counters' => $counters,
        ];
    }

    /** @return array<string, array{enabled: bool, counters: array<string, bool>}> */
    public function allSettings(): array
    {
        $out = [];
        foreach (self::SURFACES as $surface) {
            $out[$surface] = $this->settings($surface);
        }

        return $out;
    }

    /** @param array<string, mixed> $input {enabled?, counters?: {key: bool}} */
    public function updateSettings(string $surface, array $input): array
    {
        if (!in_array($surface, self::SURFACES, true)) {
            return $this->settings($surface);
        }

        if (array_key_exists('enabled', $input)) {
            SiteSetting::set(
                "public_stats_{$surface}_enabled",
                filter_var($input['enabled'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
            );
        }
        foreach (array_keys(self::COUNTERS) as $key) {
            if (array_key_exists($key, $input['counters'] ?? [])) {
                SiteSetting::set(
                    "public_stats_{$surface}_show_{$key}",
                    filter_var($input['counters'][$key], FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
                );
            }
        }
        SiteSetting::bust();
        Cache::forget($this->cacheKey($surface));

        return $this->settings($surface);
    }

    /**
     * What this surface may show. Cached per surface; empty when disabled.
     *
     * @return array{enabled: bool, stats: list<array{key: string, label: string, value: int, display: string}>}
     */
    public function payload(string $surface): array
    {
        if (!in_array($surface, self::SURFACES, true)) {
            return ['enabled' => false, 'stats' => []];
        }

        // Marketing counters must never take a public page down: any cache
        // or database failure degrades to "disabled".
        try {
            return $this->cachedPayload($surface);
        } catch (\Throwable) {
            return ['enabled' => false, 'stats' => []];
        }
    }

    /** @return array{enabled: bool, stats: list<array{key: string, label: string, value: int, display: string}>} */
    private function cachedPayload(string $surface): array
    {
        return Cache::remember($this->cacheKey($surface), self::CACHE_TTL, function () use ($surface): array {
            $settings = $this->settings($surface);
            if (!$settings['enabled']) {
                return ['enabled' => false, 'stats' => []];
            }

            $stats = [];
            foreach (self::COUNTERS as $key => $label) {
                if (!$settings['counters'][$key]) {
                    continue;
                }
                $value = $this->value($key);
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

            return ['enabled' => $stats !== [], 'stats' => $stats];
        });
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
