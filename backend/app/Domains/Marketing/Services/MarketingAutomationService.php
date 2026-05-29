<?php

declare(strict_types=1);

namespace App\Domains\Marketing\Services;

use App\Models\AbandonedCart;
use App\Models\Customer;
use App\Models\SiteSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

final class MarketingAutomationService
{
    public function settings(): array
    {
        return [
            'birthday_enabled' => $this->bool('marketing_birthday_enabled', false),
            'birthday_points' => max(0, $this->int('marketing_birthday_points', 100)),
            'birthday_sms_template' => $this->string(
                'marketing_birthday_sms_template',
                'Happy birthday from Bake & Grill! We added {points} loyalty points to your account. Order at {url}',
            ),
            'abandoned_cart_enabled' => $this->bool('marketing_abandoned_cart_enabled', false),
            'abandoned_cart_delay_minutes' => max(15, $this->int('marketing_abandoned_cart_delay_minutes', 60)),
            'abandoned_cart_sms_template' => $this->string(
                'marketing_abandoned_cart_sms_template',
                'Bake & Grill: You left items in your cart. Finish your order: {url}',
            ),
            'abandoned_cart_ttl_days' => max(1, $this->int('marketing_abandoned_cart_ttl_days', 7)),
        ];
    }

    /** @param array<string, mixed> $input */
    public function updateSettings(array $input): array
    {
        $map = [
            'birthday_enabled' => ['marketing_birthday_enabled', 'boolean'],
            'birthday_points' => ['marketing_birthday_points', 'int'],
            'birthday_sms_template' => ['marketing_birthday_sms_template', 'string'],
            'abandoned_cart_enabled' => ['marketing_abandoned_cart_enabled', 'boolean'],
            'abandoned_cart_delay_minutes' => ['marketing_abandoned_cart_delay_minutes', 'int'],
            'abandoned_cart_sms_template' => ['marketing_abandoned_cart_sms_template', 'string'],
            'abandoned_cart_ttl_days' => ['marketing_abandoned_cart_ttl_days', 'int'],
        ];

        foreach ($map as $field => [$key, $type]) {
            if (!array_key_exists($field, $input)) {
                continue;
            }

            $value = $input[$field];
            if ($type === 'boolean') {
                SiteSetting::set($key, filter_var($value, FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
            } else {
                SiteSetting::set($key, (string) $value);
            }
        }

        SiteSetting::bust();

        return $this->settings();
    }

    /**
     * @param list<array<string, mixed>> $items
     */
    public function snapshotCart(Customer $customer, array $items, int $subtotalLaar): AbandonedCart
    {
        $existing = AbandonedCart::query()
            ->where('customer_id', $customer->id)
            ->whereNull('reminded_at')
            ->latest('snapshot_at')
            ->first();

        $payload = [
            'customer_id' => $customer->id,
            'items_json' => $items,
            'subtotal_laar' => max(0, $subtotalLaar),
            'snapshot_at' => now(),
        ];

        if ($existing) {
            $existing->update($payload);

            return $existing->fresh();
        }

        return AbandonedCart::create(array_merge($payload, [
            'cart_token' => (string) Str::uuid(),
        ]));
    }

    public function orderUrl(): string
    {
        return rtrim((string) config('app.url'), '/') . '/order';
    }

    public function interpolate(string $template, array $vars): string
    {
        $out = $template;
        foreach ($vars as $key => $value) {
            $out = str_replace('{' . $key . '}', (string) $value, $out);
        }

        return $out;
    }

    public function pruneStaleCarts(): int
    {
        $cutoff = now()->subDays($this->settings()['abandoned_cart_ttl_days']);

        return AbandonedCart::query()
            ->where('snapshot_at', '<', $cutoff)
            ->delete();
    }

    /** @return Carbon */
    public function abandonedCartEligibleBefore(): Carbon
    {
        return now()->subMinutes($this->settings()['abandoned_cart_delay_minutes']);
    }

    private function bool(string $key, bool $default): bool
    {
        $raw = SiteSetting::get($key);
        if ($raw === null || $raw === '') {
            return $default;
        }

        return filter_var($raw, FILTER_VALIDATE_BOOLEAN);
    }

    private function int(string $key, int $default): int
    {
        $raw = SiteSetting::get($key);
        if ($raw === null || $raw === '') {
            return $default;
        }

        return (int) $raw;
    }

    private function string(string $key, string $default): string
    {
        $raw = SiteSetting::get($key);
        if ($raw === null || $raw === '') {
            return $default;
        }

        return trim((string) $raw);
    }
}
