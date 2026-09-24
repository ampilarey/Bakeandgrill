<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Models\SiteSetting;
use App\Models\SmsLog;
use Carbon\Carbon;

/**
 * When a text may go out (SMS audit, 2026-09-24).
 *
 * Quiet hours: marketing texts (and, if the owner says so, owner alerts)
 * that fall inside the window are held as `deferred` and released by
 * `sms:release-deferred` when the window ends. Login codes, order and
 * payment texts are never held.
 *
 * Marketing cap: at most N marketing texts to one number in a rolling day,
 * whatever campaign, promotion or automation they come from. The
 * suppressed row in the log says which cap stopped it.
 */
final class SmsDeliveryRules
{
    public const QUIET_ENABLED = 'sms_quiet_hours_enabled';

    public const QUIET_START = 'sms_quiet_hours_start';

    public const QUIET_END = 'sms_quiet_hours_end';

    public const QUIET_ALERTS = 'sms_quiet_hours_alerts';

    public const MARKETING_CAP = 'sms_marketing_daily_cap';

    public const LOG_RETENTION = 'sms_log_retention_days';

    public const OPT_OUT_LINE = 'sms_marketing_opt_out_line';

    public const OPT_OUT_LINE_DEFAULT = 'Stop: {url}';

    /** @return array{quiet_hours_enabled: bool, quiet_hours_start: string, quiet_hours_end: string, quiet_hours_alerts: bool, marketing_daily_cap: int, log_retention_days: int, marketing_opt_out_line: string} */
    public static function all(): array
    {
        return [
            'quiet_hours_enabled' => SmsTypeRegistry::settingIsTruthy(SiteSetting::get(self::QUIET_ENABLED, '0'), false),
            'quiet_hours_start' => self::time(SiteSetting::get(self::QUIET_START, '22:00'), '22:00'),
            'quiet_hours_end' => self::time(SiteSetting::get(self::QUIET_END, '08:00'), '08:00'),
            'quiet_hours_alerts' => SmsTypeRegistry::settingIsTruthy(SiteSetting::get(self::QUIET_ALERTS, '0'), false),
            'marketing_daily_cap' => max(0, (int) SiteSetting::get(self::MARKETING_CAP, '1')),
            // How long sms_logs rows are kept; 0 keeps them forever.
            'log_retention_days' => max(0, (int) SiteSetting::get(self::LOG_RETENTION, '365')),
            // Appended to every marketing text; {url} becomes the short unsubscribe link. Empty = none.
            'marketing_opt_out_line' => self::optOutLine(),
        ];
    }

    /** @param array<string, mixed> $input */
    public static function update(array $input): array
    {
        if (array_key_exists('quiet_hours_enabled', $input)) {
            SiteSetting::set(self::QUIET_ENABLED, filter_var($input['quiet_hours_enabled'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        }
        if (array_key_exists('quiet_hours_start', $input)) {
            SiteSetting::set(self::QUIET_START, self::time($input['quiet_hours_start'], '22:00'));
        }
        if (array_key_exists('quiet_hours_end', $input)) {
            SiteSetting::set(self::QUIET_END, self::time($input['quiet_hours_end'], '08:00'));
        }
        if (array_key_exists('quiet_hours_alerts', $input)) {
            SiteSetting::set(self::QUIET_ALERTS, filter_var($input['quiet_hours_alerts'], FILTER_VALIDATE_BOOLEAN) ? '1' : '0');
        }
        if (array_key_exists('marketing_daily_cap', $input)) {
            SiteSetting::set(self::MARKETING_CAP, (string) max(0, min(50, (int) $input['marketing_daily_cap'])));
        }
        if (array_key_exists('marketing_opt_out_line', $input)) {
            // SiteSetting::get() reads an empty value as "unset", so "no line" is stored as the word off.
            $line = mb_substr(trim((string) ($input['marketing_opt_out_line'] ?? '')), 0, 80);
            SiteSetting::set(self::OPT_OUT_LINE, $line === '' ? 'off' : $line);
        }
        if (array_key_exists('log_retention_days', $input)) {
            SiteSetting::set(self::LOG_RETENTION, (string) max(0, min(3650, (int) $input['log_retention_days'])));
        }
        SiteSetting::bust();

        return self::all();
    }

    /** Whether the type is one quiet hours hold back. */
    public static function heldInQuietHours(array $entry): bool
    {
        if (!empty($entry['always_on'])) {
            return false;
        }
        $rules = self::all();
        if (!$rules['quiet_hours_enabled']) {
            return false;
        }
        $category = (string) ($entry['category'] ?? '');

        return $category === 'marketing'
            || ($rules['quiet_hours_alerts'] && in_array($category, ['staff', 'system'], true));
    }

    public static function inQuietHours(?Carbon $now = null): bool
    {
        $rules = self::all();
        if (!$rules['quiet_hours_enabled']) {
            return false;
        }
        $now = $now ?? now(config('app.timezone', 'Indian/Maldives'));
        $t = $now->format('H:i');
        [$start, $end] = [$rules['quiet_hours_start'], $rules['quiet_hours_end']];
        if ($start === $end) {
            return false;
        }

        // 22:00–08:00 wraps midnight; 13:00–15:00 does not.
        return $start < $end ? ($t >= $start && $t < $end) : ($t >= $start || $t < $end);
    }

    /** When the current quiet window ends. */
    public static function quietHoursEndAt(?Carbon $now = null): Carbon
    {
        $now = $now ?? now(config('app.timezone', 'Indian/Maldives'));
        $end = self::all()['quiet_hours_end'];
        $at = $now->copy()->setTimeFromTimeString($end);

        return $at->lte($now) ? $at->addDay() : $at;
    }

    /** @return list<string> every registry key in the marketing category, plus the legacy aliases */
    public static function marketingTypeKeys(): array
    {
        $keys = [];
        foreach (SmsTypeRegistry::all() as $entry) {
            if (($entry['category'] ?? '') === 'marketing') {
                $keys[] = $entry['key'];
            }
        }

        return array_values(array_unique([...$keys, 'campaign', 'promotion', 'marketing']));
    }

    /** The cap reason for one more marketing text to this number, or null. */
    public static function marketingCapReason(string $normalizedPhone, array $entry): ?string
    {
        if (($entry['category'] ?? '') !== 'marketing' || !empty($entry['always_on'])) {
            return null;
        }
        $cap = self::all()['marketing_daily_cap'];
        if ($cap <= 0) {
            return null;
        }
        $sentToday = SmsLog::query()
            ->where('to', $normalizedPhone)
            ->whereIn('type', self::marketingTypeKeys())
            ->whereIn('status', ['sent', 'demo', 'queued', 'deferred'])
            ->where('created_at', '>=', now()->subDay())
            ->count();

        return $sentToday >= $cap
            ? "Marketing cap: this number already had {$sentToday} marketing text" . ($sentToday === 1 ? '' : 's') . ' in the last day (cap ' . $cap . ').'
            : null;
    }

    public static function optOutLine(): string
    {
        $raw = SiteSetting::get(self::OPT_OUT_LINE, null);
        if ($raw === null) {
            return self::OPT_OUT_LINE_DEFAULT;
        }
        $line = trim((string) $raw);

        return in_array(mb_strtolower($line), ['off', 'none', '-'], true) ? '' : $line;
    }

    /** The short unsubscribe address as printed in a text: no scheme, no trailing slash. */
    public static function optOutUrl(): string
    {
        return (string) preg_replace('#^https?://#', '', rtrim(url('/sms'), '/'));
    }

    /**
     * A marketing text with the unsubscribe line on the end, unless it is
     * already there or the owner switched the line off.
     */
    public static function withOptOutLine(string $message, array $entry): string
    {
        if (($entry['category'] ?? '') !== 'marketing' || !empty($entry['always_on'])) {
            return $message;
        }
        $line = self::optOutLine();
        if ($line === '') {
            return $message;
        }
        $url = self::optOutUrl();
        if (str_contains($message, $url)) {
            return $message;
        }

        return rtrim($message) . "\n" . str_replace('{url}', $url, $line);
    }

    private static function time(mixed $raw, string $default): string
    {
        $raw = trim((string) $raw);

        return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $raw) === 1 ? $raw : $default;
    }
}
