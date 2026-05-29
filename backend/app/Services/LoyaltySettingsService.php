<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\LoyaltyTier;
use App\Models\SiteSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

final class LoyaltySettingsService
{
    private const CACHE_KEY = 'loyalty_settings.resolved';

    public function all(): array
    {
        return Cache::remember(self::CACHE_KEY, 60, fn (): array => [
            'enabled' => $this->enabled(),
            'earn_rate_per_mvr' => $this->earnRatePerMvr(),
            'redeem_rate_points_per_mvr' => $this->redeemRatePointsPerMvr(),
            'min_redeem_points' => $this->minRedeemPoints(),
            'max_redeem_points' => $this->maxRedeemPoints(),
            'max_redeem_percent' => $this->maxRedeemPercent(),
            'hold_ttl_minutes' => $this->holdTtlMinutes(),
            'tiers_enabled' => $this->tiersEnabled(),
            'points_expiry_days' => $this->pointsExpiryDays(),
            'earn_on_delivery_fee' => $this->earnOnDeliveryFee(),
            'program_starts_at' => $this->programStartsAt(),
            'program_ends_at' => $this->programEndsAt(),
            'customer_message' => $this->customerMessage(),
        ]);
    }

    public function bustCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    public function update(array $input): array
    {
        $map = [
            'enabled' => ['loyalty_enabled', 'boolean'],
            'earn_rate_per_mvr' => ['loyalty_earn_rate', 'float'],
            'redeem_rate_points_per_mvr' => ['loyalty_redeem_rate', 'int'],
            'min_redeem_points' => ['loyalty_min_redeem', 'int'],
            'max_redeem_points' => ['loyalty_max_redeem', 'int'],
            'max_redeem_percent' => ['loyalty_max_redeem_percent', 'float'],
            'hold_ttl_minutes' => ['loyalty_hold_ttl', 'int'],
            'tiers_enabled' => ['loyalty_tiers_enabled', 'boolean'],
            'points_expiry_days' => ['loyalty_points_expiry_days', 'int'],
            'earn_on_delivery_fee' => ['loyalty_earn_on_delivery_fee', 'boolean'],
            'program_starts_at' => ['loyalty_program_starts_at', 'datetime'],
            'program_ends_at' => ['loyalty_program_ends_at', 'datetime'],
            'customer_message' => ['loyalty_customer_message', 'string'],
        ];

        foreach ($map as $field => [$key, $type]) {
            if (!array_key_exists($field, $input)) {
                continue;
            }

            $value = $input[$field];
            if ($type === 'boolean') {
                $stored = filter_var($value, FILTER_VALIDATE_BOOLEAN) ? '1' : '0';
            } elseif ($type === 'datetime') {
                $stored = $value ? (string) $value : '';
            } else {
                $stored = (string) $value;
            }

            SiteSetting::set($key, $stored);
        }

        $this->bustCache();
        SiteSetting::bust();

        return $this->all();
    }

    public function publicRates(): array
    {
        return [
            'enabled' => $this->enabled() && $this->isProgramActive(),
            'earn_per_mvr' => $this->earnRatePerMvr(),
            'redeem_rate_points_per_mvr' => $this->redeemRatePointsPerMvr(),
            'min_redeem_points' => $this->minRedeemPoints(),
            'max_redeem_points' => $this->maxRedeemPoints(),
            'max_redeem_percent' => $this->maxRedeemPercent(),
            'points_expiry_days' => $this->pointsExpiryDays(),
            'customer_message' => $this->customerMessage(),
        ];
    }

    public function enabled(): bool
    {
        return $this->bool('loyalty_enabled', (bool) config('app.loyalty_enabled', true));
    }

    public function isProgramActive(): bool
    {
        if (!$this->enabled()) {
            return false;
        }

        $now = now();
        $starts = $this->programStartsAt();
        $ends = $this->programEndsAt();

        if ($starts && $now->lt(Carbon::parse($starts))) {
            return false;
        }

        if ($ends && $now->gt(Carbon::parse($ends))) {
            return false;
        }

        return true;
    }

    public function earnRatePerMvr(): float
    {
        return max(0, $this->float('loyalty_earn_rate', (float) config('app.loyalty_earn_rate', 1)));
    }

    public function redeemRatePointsPerMvr(): int
    {
        return max(1, $this->int('loyalty_redeem_rate', (int) config('app.loyalty_redeem_rate', 100)));
    }

    public function minRedeemPoints(): int
    {
        return max(1, $this->int('loyalty_min_redeem', (int) config('app.loyalty_min_redeem', 100)));
    }

    public function maxRedeemPoints(): int
    {
        return max(1, $this->int('loyalty_max_redeem', (int) config('app.loyalty_max_redeem', 10000)));
    }

    public function maxRedeemPercent(): float
    {
        $v = $this->float('loyalty_max_redeem_percent', (float) config('app.loyalty_max_redeem_percent', 50));

        return min(100, max(0, $v));
    }

    public function holdTtlMinutes(): int
    {
        return max(1, $this->int('loyalty_hold_ttl', (int) config('app.loyalty_hold_ttl', 30)));
    }

    public function tiersEnabled(): bool
    {
        return $this->bool('loyalty_tiers_enabled', (bool) config('app.loyalty_tiers_enabled', false));
    }

    public function earnOnDeliveryFee(): bool
    {
        return $this->bool('loyalty_earn_on_delivery_fee', false);
    }

    public function pointsExpiryDays(): int
    {
        return max(0, $this->int('loyalty_points_expiry_days', 0));
    }

    public function programStartsAt(): ?string
    {
        $v = trim((string) SiteSetting::get('loyalty_program_starts_at', ''));

        return $v !== '' ? $v : null;
    }

    public function programEndsAt(): ?string
    {
        $v = trim((string) SiteSetting::get('loyalty_program_ends_at', ''));

        return $v !== '' ? $v : null;
    }

    public function customerMessage(): string
    {
        return trim((string) SiteSetting::get('loyalty_customer_message', ''));
    }

    public function creditExpiresAt(): ?Carbon
    {
        $days = $this->pointsExpiryDays();

        return $days > 0 ? now()->addDays($days) : null;
    }

    /** @return Collection<int, LoyaltyTier> */
    public function tiers(): Collection
    {
        return LoyaltyTier::orderBy('sort_order')->orderBy('min_lifetime_points')->get();
    }

    public function tierForLifetimePoints(int $lifetime): string
    {
        $tier = $this->tiers()
            ->filter(fn (LoyaltyTier $t) => $lifetime >= $t->min_lifetime_points)
            ->sortByDesc('min_lifetime_points')
            ->first();

        return $tier?->slug ?? 'bronze';
    }

    public function tierMultiplier(string $tierSlug): float
    {
        if (!$this->tiersEnabled()) {
            return 1.0;
        }

        $tier = $this->tiers()->firstWhere('slug', $tierSlug);

        return max(0, (float) ($tier?->earn_multiplier ?? 1.0));
    }

    /** @param list<array<string, mixed>> $rows */
    public function syncTiers(array $rows): Collection
    {
        foreach ($rows as $row) {
            if (!isset($row['id'])) {
                continue;
            }

            LoyaltyTier::where('id', $row['id'])->update([
                'name' => $row['name'] ?? 'Tier',
                'slug' => $row['slug'] ?? 'tier',
                'min_lifetime_points' => max(0, (int) ($row['min_lifetime_points'] ?? 0)),
                'earn_multiplier' => max(0, (float) ($row['earn_multiplier'] ?? 1)),
                'sort_order' => (int) ($row['sort_order'] ?? 0),
            ]);
        }

        $this->bustCache();

        return $this->tiers();
    }

    private function bool(string $key, bool $default): bool
    {
        $raw = SiteSetting::get($key, null);

        if ($raw === null || $raw === '') {
            return $default;
        }

        return filter_var($raw, FILTER_VALIDATE_BOOLEAN);
    }

    private function int(string $key, int $default): int
    {
        $raw = SiteSetting::get($key, null);

        if ($raw === null || $raw === '') {
            return $default;
        }

        return (int) $raw;
    }

    private function float(string $key, float $default): float
    {
        $raw = SiteSetting::get($key, null);

        if ($raw === null || $raw === '') {
            return $default;
        }

        return (float) $raw;
    }
}
