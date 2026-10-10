<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Domains\Notifications\Services\SmsEmailCopier;
use App\Domains\Telegram\Services\TelegramAlertCopier;

/**
 * Whether an alert is on at all (notifications audit, 2026-10-10).
 *
 * Each alert has one switch per channel on its row in Admin → Notifications
 * and nothing else: the second switches that used to sit on Purchasing,
 * Delivery, the Complaint box, the Social Hub and TV Signage are gone. A
 * sender asks this before working an alert out, so one with every channel
 * off costs nothing and leaves no "disabled" rows in the log. With any
 * channel on it sends, and SmsService decides each channel as before.
 */
final class AlertSwitch
{
    public static function isOn(string $typeKey): bool
    {
        $entry = SmsTypeRegistry::get($typeKey);
        if ($entry === null) {
            return true;
        }

        return SmsTypeRegistry::isTypeEnabled($entry)
            || SmsEmailCopier::wanted($typeKey)
            || TelegramAlertCopier::typeWanted($entry, $typeKey);
    }

    /** Every channel of one row on or off at once (the migration's "off", and tests). */
    public static function setAll(string $typeKey, bool $on): void
    {
        $entry = SmsTypeRegistry::get($typeKey);
        if ($entry !== null && !empty($entry['enabled_setting'])) {
            \App\Models\SiteSetting::set((string) $entry['enabled_setting'], $on ? 'true' : 'false');
        }
        SmsTypeRegistry::setEmailEnabled($typeKey, $on);
        SmsTypeRegistry::setTelegramEnabled($typeKey, $on);
    }

    /** True when at least one of the given alerts is on. */
    public static function anyOn(string ...$typeKeys): bool
    {
        foreach ($typeKeys as $key) {
            if (self::isOn($key)) {
                return true;
            }
        }

        return false;
    }
}
