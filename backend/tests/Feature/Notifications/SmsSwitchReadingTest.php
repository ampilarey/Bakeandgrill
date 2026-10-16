<?php

declare(strict_types=1);

namespace Tests\Feature\Notifications;

use App\Domains\Notifications\Support\SmsNotificationSettings;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Audit, 2026-10-16: the till's SMS switches (Send bill, Pay link, receipt
 * resend…) counted only "true" as on, while the Notifications page also
 * counted "1", "yes" and "on". Both read a switch the same way now.
 */
class SmsSwitchReadingTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_tills_switch_reads_like_the_notifications_page(): void
    {
        $key = SmsNotificationSettings::POS_SEND_BILL;

        foreach (['true', '1', 'yes', 'on', 'TRUE'] as $on) {
            SiteSetting::set($key, $on);
            SiteSetting::bust();
            $this->assertTrue(SmsNotificationSettings::isEnabled($key), "'{$on}' reads on");
            $this->assertTrue(SmsTypeRegistry::settingIsTruthy(SiteSetting::get($key)), "'{$on}' reads on on the page");
        }

        foreach (['false', '0', 'no', 'off'] as $off) {
            SiteSetting::set($key, $off);
            SiteSetting::bust();
            $this->assertFalse(SmsNotificationSettings::isEnabled($key), "'{$off}' reads off");
        }
    }

    public function test_a_switch_never_saved_keeps_its_default(): void
    {
        $this->assertTrue(SmsNotificationSettings::isEnabled('sms_never_saved_enabled'));
        $this->assertFalse(SmsNotificationSettings::isEnabled('sms_never_saved_enabled', false));
    }
}
