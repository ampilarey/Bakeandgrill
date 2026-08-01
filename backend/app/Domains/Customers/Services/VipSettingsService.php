<?php

declare(strict_types=1);

namespace App\Domains\Customers\Services;

use App\Models\SiteSetting;
use App\Support\ResilientCache;
use Illuminate\Support\Facades\Cache;

/**
 * Configurable VIP CRM segment rules (spend + paid orders).
 * Distinct from loyalty gold/platinum (points-based earn multipliers).
 */
final class VipSettingsService
{
    public const DEFAULT_MIN_SPEND_MVR = 5000;

    public const DEFAULT_MIN_PAID_ORDERS = 2;

    private const CACHE_KEY = 'vip_settings.resolved';

    public function all(): array
    {
        return ResilientCache::remember(self::CACHE_KEY, 60, fn (): array => [
            'min_spend_mvr' => $this->minSpendMvr(),
            'min_paid_orders' => $this->minPaidOrders(),
            'auto_sync_tag' => $this->autoSyncTag(),
            'label' => $this->segmentLabel(),
        ]);
    }

    public function bustCache(): void
    {
        ResilientCache::forget(self::CACHE_KEY);
    }

    public function update(array $input): array
    {
        if (array_key_exists('min_spend_mvr', $input)) {
            $spend = max(0, (float) $input['min_spend_mvr']);
            SiteSetting::set('vip_min_spend_mvr', (string) $spend);
        }

        if (array_key_exists('min_paid_orders', $input)) {
            $orders = max(1, (int) $input['min_paid_orders']);
            SiteSetting::set('vip_min_paid_orders', (string) $orders);
        }

        if (array_key_exists('auto_sync_tag', $input)) {
            $on = filter_var($input['auto_sync_tag'], FILTER_VALIDATE_BOOLEAN);
            SiteSetting::set('vip_auto_sync_tag', $on ? '1' : '0');
        }

        $this->bustCache();
        SiteSetting::bust();

        return $this->all();
    }

    public function minSpendMvr(): float
    {
        $raw = SiteSetting::get('vip_min_spend_mvr', (string) self::DEFAULT_MIN_SPEND_MVR);

        return max(0.0, (float) $raw);
    }

    public function minPaidOrders(): int
    {
        $raw = SiteSetting::get('vip_min_paid_orders', (string) self::DEFAULT_MIN_PAID_ORDERS);

        return max(1, (int) $raw);
    }

    public function autoSyncTag(): bool
    {
        $raw = SiteSetting::get('vip_auto_sync_tag', '1');

        return filter_var($raw, FILTER_VALIDATE_BOOLEAN);
    }

    public function segmentLabel(): string
    {
        $spend = number_format($this->minSpendMvr(), 0);
        $orders = $this->minPaidOrders();

        return "VIP customers (≥{$orders} paid orders · ≥MVR {$spend})";
    }
}
