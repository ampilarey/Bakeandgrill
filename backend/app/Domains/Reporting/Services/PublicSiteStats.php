<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Models\Customer;
use App\Models\Order;
use App\Models\SiteSetting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Public "social proof" numbers for the website and order app: orders
 * served, registered customers, monthly visitors. Owner-controlled per
 * counter and OFF by default. Displayed values are rounded DOWN to a
 * friendly step ("12,500+") so exact business figures are never exposed;
 * revenue is deliberately not offered here at all.
 */
class PublicSiteStats
{
    private const CACHE_KEY = 'public_site_stats:payload';

    private const CACHE_TTL = 600;

    /** @return array{enabled: bool, show_orders: bool, show_customers: bool, show_visitors: bool} */
    public function settings(): array
    {
        $flag = fn (string $key) => filter_var(SiteSetting::get($key, '0'), FILTER_VALIDATE_BOOLEAN);

        return [
            'enabled' => $flag('public_stats_enabled'),
            'show_orders' => $flag('public_stats_show_orders'),
            'show_customers' => $flag('public_stats_show_customers'),
            'show_visitors' => $flag('public_stats_show_visitors'),
        ];
    }

    /** @param array<string, mixed> $input */
    public function updateSettings(array $input): array
    {
        foreach (['enabled', 'show_orders', 'show_customers', 'show_visitors'] as $key) {
            if (array_key_exists($key, $input)) {
                SiteSetting::set(
                    'public_stats_' . ($key === 'enabled' ? 'enabled' : $key),
                    filter_var($input[$key], FILTER_VALIDATE_BOOLEAN) ? '1' : '0',
                );
            }
        }
        SiteSetting::bust();
        Cache::forget(self::CACHE_KEY);

        return $this->settings();
    }

    /**
     * What the public may see. Cached; empty stats when disabled.
     *
     * @return array{enabled: bool, stats: list<array{key: string, label: string, value: int, display: string}>}
     */
    public function payload(): array
    {
        // Marketing counters must never take a public page down: any cache
        // or database failure degrades to "disabled".
        try {
            return $this->cachedPayload();
        } catch (\Throwable) {
            return ['enabled' => false, 'stats' => []];
        }
    }

    /** @return array{enabled: bool, stats: list<array{key: string, label: string, value: int, display: string}>} */
    private function cachedPayload(): array
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function (): array {
            $settings = $this->settings();
            if (!$settings['enabled']) {
                return ['enabled' => false, 'stats' => []];
            }

            $stats = [];
            if ($settings['show_orders']) {
                // Retail + wholesale + catering — the same definition the
                // admin dashboard uses (OrderTallies).
                $stats[] = $this->stat('orders', 'Orders served', \App\Domains\Reporting\Support\OrderTallies::combined());
            }
            if ($settings['show_customers']) {
                $stats[] = $this->stat('customers', 'Happy customers', Customer::count());
            }
            if ($settings['show_visitors']) {
                $tz = config('app.timezone', 'Indian/Maldives');
                $stats[] = $this->stat('visitors', 'Visitors this month', (int) DB::table('site_visits_daily')
                    ->where('date', '>=', now($tz)->subDays(29)->toDateString())
                    ->sum('uniques'));
            }

            // Zero counters would look worse than nothing — hide them.
            $stats = array_values(array_filter($stats, fn (array $s) => $s['value'] > 0));

            return ['enabled' => $stats !== [], 'stats' => $stats];
        });
    }

    /** @return array{key: string, label: string, value: int, display: string} */
    private function stat(string $key, string $label, int $value): array
    {
        return ['key' => $key, 'label' => $label, 'value' => $value, 'display' => $this->friendly($value)];
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
