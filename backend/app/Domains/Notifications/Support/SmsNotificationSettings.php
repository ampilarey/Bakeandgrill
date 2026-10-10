<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Models\SiteSetting;

final class SmsNotificationSettings
{
    /** Counter (POS) and online payment confirmations: one switch each since 2026-10-10. */
    public const PAYMENT_CONFIRMED_POS = 'sms_customer_payment_confirmed_pos_enabled';

    public const PAYMENT_CONFIRMED_ONLINE = 'sms_customer_payment_confirmed_online_enabled';

    public const COMPLETION_RECEIPT = 'sms_customer_completion_receipt_enabled';

    public const POS_SEND_BILL = 'sms_pos_send_bill_enabled';

    public const POS_SEND_PAY_LINK = 'sms_pos_send_pay_link_enabled';

    public const POS_FIRE_TO_KITCHEN = 'sms_pos_fire_to_kitchen_enabled';

    public const POS_RECEIPT_RESEND = 'sms_pos_receipt_resend_enabled';

    public const CUSTOMER_PREPARING = 'sms_customer_preparing_enabled';

    public const CUSTOMER_READY = 'sms_customer_ready_enabled';

    public const CUSTOMER_ON_THE_WAY = 'sms_customer_on_the_way_enabled';

    public const DISABLED_MESSAGE = 'SMS switched off in Admin → Notifications.';

    /** SMS off for this (to save cost) and no email to fall back on (owner, 2026-10-06). */
    public const OFF_NO_EMAIL_MESSAGE = 'SMS is switched off for this, and the customer has no email to send it to.';

    /**
     * Whether a POS button may send: its SMS is on, or its email copy is on
     * (the email then goes alone). Used for the till's button visibility.
     */
    public static function smsOrEmail(string $key, string $smsType): bool
    {
        return self::isEnabled($key) || \App\Domains\Notifications\Services\SmsEmailCopier::wanted($smsType);
    }

    public static function isEnabled(string $key, bool $default = true): bool
    {
        return SiteSetting::get($key, $default ? 'true' : 'false') === 'true';
    }
}
