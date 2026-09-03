<?php

declare(strict_types=1);

namespace App\Domains\Orders\Support;

use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Permissions\Services\PermissionService;
use App\Models\SiteSetting;
use App\Models\User;

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

    public const MARGIN_FLOOR_ENABLED = 'discount_margin_floor_enabled';

    public const MARGIN_FLOOR_PCT = 'discount_margin_floor_pct';

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

    /**
     * Whether a manual discount needs a manager's say-so. Always, now.
     *
     * Owner, 2026-09-02: "a cashier must not apply a random discount any
     * amount without manager/admin approval". This used to be a switch that
     * shipped off; it is no longer a switch. A cashier gets an SMS code from
     * an approver; somebody who holds `promotions.discount_override` (the
     * managers, and owner/admin by their role) is the approver and applies
     * directly, recorded as approving their own discount. The stored setting
     * is kept only so old rows and payloads keep their shape.
     */
    public static function approvalRequired(): bool
    {
        return true;
    }

    /** Whether this person may apply a manual discount without a code. */
    public static function canSelfApprove(?User $user): bool
    {
        return $user instanceof User && app(PermissionService::class)->hasPermission($user, 'promotions.discount_override');
    }

    /**
     * Who receives the approval code: the configured approvers, or, when
     * nobody has been configured, every active user who may approve
     * discounts and has a phone number. Without the fallback a fresh
     * install, or a cleared list, would leave every cashier unable to give
     * any discount at all.
     *
     * @return list<array{user_id: int|null, phone: string, label: string}>
     */
    public static function effectiveApprovers(): array
    {
        $configured = self::approvers();
        if ($configured !== []) {
            return $configured;
        }

        $permissions = app(PermissionService::class);

        return User::query()
            ->where('is_active', true)
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->with('role')
            ->orderBy('name')
            ->get()
            ->filter(fn (User $u) => $permissions->hasPermission($u, 'promotions.discount_override'))
            ->map(fn (User $u) => [
                'user_id' => (int) $u->id,
                'phone' => trim((string) $u->phone),
                'label' => (string) $u->name,
            ])
            ->values()
            ->all();
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

    public static function marginFloorEnabled(): bool
    {
        return SmsTypeRegistry::settingIsTruthy(
            SiteSetting::get(self::MARGIN_FLOOR_ENABLED, 'false'),
            false,
        );
    }

    /** Minimum margin % above cost after item/category discounts (0 = never below cost). */
    public static function marginFloorPct(): int
    {
        return max(0, min(100, (int) SiteSetting::get(self::MARGIN_FLOOR_PCT, '0')));
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
