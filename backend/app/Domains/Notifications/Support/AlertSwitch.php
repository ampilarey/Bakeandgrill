<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

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
 *
 * Since the re-audit the Email switch also covers a message's own email
 * (order confirmed, gift card, catering), and a Telegram-only alert has its
 * Telegram switch and nothing else.
 */
final class AlertSwitch
{
    /**
     * Each channel's state for one row: whether the message can go that way
     * and the switch is on (for Telegram, the master switch too).
     *
     * @return array{sms: bool, email: bool, telegram: bool}
     */
    public static function channels(string $typeKey): array
    {
        $entry = SmsTypeRegistry::get($typeKey);
        if ($entry === null) {
            return ['sms' => true, 'email' => false, 'telegram' => false];
        }
        $has = SmsTypeRegistry::channels($entry);

        return [
            'sms' => in_array('sms', $has, true) && SmsTypeRegistry::isTypeEnabled($entry),
            'email' => in_array('email', $has, true) && (!empty($entry['always_on']) || SmsTypeRegistry::isEmailEnabled($typeKey)),
            'telegram' => in_array('telegram', $has, true) && TelegramAlertCopier::typeWanted($entry, $typeKey),
        ];
    }

    public static function isOn(string $typeKey): bool
    {
        $on = self::channels($typeKey);

        return $on['sms'] || $on['email'] || $on['telegram'];
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
