<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Models\SiteSetting;

final class SmsNotificationSettings
{
    public const PAYMENT_CONFIRMED = 'sms_customer_payment_confirmed_enabled';

    public const COMPLETION_RECEIPT = 'sms_customer_completion_receipt_enabled';

    public const POS_SEND_BILL = 'sms_pos_send_bill_enabled';

    public const POS_SEND_PAY_LINK = 'sms_pos_send_pay_link_enabled';

    public const POS_FIRE_TO_KITCHEN = 'sms_pos_fire_to_kitchen_enabled';

    public const POS_RECEIPT_RESEND = 'sms_pos_receipt_resend_enabled';

    public const CUSTOMER_PREPARING = 'sms_customer_preparing_enabled';

    public const CUSTOMER_READY = 'sms_customer_ready_enabled';

    public const CUSTOMER_ON_THE_WAY = 'sms_customer_on_the_way_enabled';

    public const DISABLED_MESSAGE = 'SMS disabled in Admin → Settings → Notifications.';

    public static function isEnabled(string $key, bool $default = true): bool
    {
        return SiteSetting::get($key, $default ? 'true' : 'false') === 'true';
    }
}
