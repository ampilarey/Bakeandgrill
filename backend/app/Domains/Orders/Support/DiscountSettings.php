<?php

declare(strict_types=1);

namespace App\Domains\Orders\Support;

use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Models\SiteSetting;

/**
 * Typed getters for POS discount control SiteSettings.
 */
final class DiscountSettings
{
    public const MANUAL_ENABLED = 'discount_manual_enabled';

    public const MAX_PERCENT = 'discount_max_percent';

    public const MAX_FIXED_MVR = 'discount_max_fixed_mvr';

    public const ROLE_CAPS = 'discount_role_caps';

    public const REASON_REQUIRED = 'discount_reason_required';

    public const REASONS = 'discount_reasons';

    public const APPROVAL_REQUIRED = 'discount_approval_required';

    public const APPROVERS = 'discount_approval_approvers';

    public const CODE_TTL_MINUTES = 'discount_approval_code_ttl_minutes';

    public const MAX_ATTEMPTS = 'discount_approval_max_attempts';

    public static function manualEnabled(): bool
    {
        return SmsTypeRegistry::settingIsTruthy(
            SiteSetting::get(self::MANUAL_ENABLED, 'true'),
            true,
        );
    }

    public static function maxPercent(): int
    {
        $raw = SiteSetting::get(self::MAX_PERCENT, '100');
        $n = (int) $raw;

        return max(0, min(100, $n));
    }

    /** Absolute MVR ceiling; 0 = disabled. */
    public static function maxFixedMvr(): float
    {
        $raw = SiteSetting::get(self::MAX_FIXED_MVR, '0');
        $n = (float) $raw;

        return max(0.0, $n);
    }

    /** @return array<string, array{percent?: int|float, fixed_mvr?: int|float}> */
    public static function roleCaps(): array
    {
        $raw = SiteSetting::get(self::ROLE_CAPS, '{}');
        if (is_array($raw)) {
            return $raw;
        }
        $decoded = json_decode((string) $raw, true);

        return is_array($decoded) ? $decoded : [];
    }

    public static function reasonRequired(): bool
    {
        return SmsTypeRegistry::settingIsTruthy(
            SiteSetting::get(self::REASON_REQUIRED, 'false'),
            false,
        );
    }

    /** @return list<string> */
    public static function reasons(): array
    {
        $raw = SiteSetting::get(self::REASONS, '[]');
        if (is_array($raw)) {
            return array_values(array_map('strval', $raw));
        }
        $decoded = json_decode((string) $raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        return array_values(array_filter(array_map(
            fn ($r) => trim((string) $r),
            $decoded,
        ), fn ($r) => $r !== ''));
    }

    public static function approvalRequired(): bool
    {
        return SmsTypeRegistry::settingIsTruthy(
            SiteSetting::get(self::APPROVAL_REQUIRED, 'false'),
            false,
        );
    }

    /** @return list<array{user_id: int|null, phone: string, label: string}> */
    public static function approvers(): array
    {
        $raw = SiteSetting::get(self::APPROVERS, '[]');
        $decoded = is_array($raw) ? $raw : json_decode((string) $raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        $out = [];
        foreach ($decoded as $row) {
            if (!is_array($row)) {
                continue;
            }
            $phone = trim((string) ($row['phone'] ?? ''));
            if ($phone === '') {
                continue;
            }
            $out[] = [
                'user_id' => isset($row['user_id']) && $row['user_id'] !== '' && $row['user_id'] !== null
                    ? (int) $row['user_id']
                    : null,
                'phone' => $phone,
                'label' => trim((string) ($row['label'] ?? '')),
            ];
        }

        return $out;
    }

    public static function codeTtlMinutes(): int
    {
        return max(1, min(60, (int) SiteSetting::get(self::CODE_TTL_MINUTES, '10')));
    }

    public static function maxAttempts(): int
    {
        return max(1, min(20, (int) SiteSetting::get(self::MAX_ATTEMPTS, '5')));
    }

    /**
     * Effective cap in laari for a role slug: min(global %, global fixed, role caps, subtotal).
     */
    public static function effectiveCapLaar(int $subtotalLaar, ?string $roleSlug): int
    {
        if ($subtotalLaar <= 0) {
            return 0;
        }

        $caps = [];
        $percent = self::maxPercent();
        $caps[] = (int) floor($subtotalLaar * $percent / 100);

        $fixedMvr = self::maxFixedMvr();
        if ($fixedMvr > 0) {
            $caps[] = (int) round($fixedMvr * 100);
        }

        if ($roleSlug !== null && $roleSlug !== '') {
            $roleCaps = self::roleCaps();
            $role = $roleCaps[$roleSlug] ?? null;
            if (is_array($role)) {
                if (isset($role['percent']) && $role['percent'] !== '' && $role['percent'] !== null) {
                    $rp = max(0, min(100, (float) $role['percent']));
                    $caps[] = (int) floor($subtotalLaar * $rp / 100);
                }
                if (isset($role['fixed_mvr']) && (float) $role['fixed_mvr'] > 0) {
                    $caps[] = (int) round((float) $role['fixed_mvr'] * 100);
                }
            }
        }

        $caps[] = $subtotalLaar;

        return max(0, min($caps));
    }
}
