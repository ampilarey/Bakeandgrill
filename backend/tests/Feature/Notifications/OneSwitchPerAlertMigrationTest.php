<?php

declare(strict_types=1);

namespace Tests\Feature\Notifications;

use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Models\SiteSetting;
use App\Models\SmsScheduledMessage;
use App\Models\SmsTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Notifications audit, 2026-10-10: folding the second switches into each
 * alert's row must not change what sends.
 */
class OneSwitchPerAlertMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function migrate(): void
    {
        (require database_path('migrations/2026_10_10_120000_notifications_one_switch_per_alert.php'))->up();
    }

    private function channels(string $type): array
    {
        $entry = SmsTypeRegistry::get($type);

        return [
            'sms' => SmsTypeRegistry::isTypeEnabled($entry),
            'email' => SmsTypeRegistry::isEmailEnabled($type),
            'telegram' => SmsTypeRegistry::isTelegramEnabled($type),
        ];
    }

    public function test_an_alert_whose_second_switch_was_off_ends_up_off_on_its_row(): void
    {
        AlertSwitch::setAll('owner_price_rise', true);
        SiteSetting::set('ops_price_rise_alert_sms', '0');

        $this->migrate();

        $this->assertSame(['sms' => false, 'email' => false, 'telegram' => false], $this->channels('owner_price_rise'));
        $this->assertFalse(AlertSwitch::isOn('owner_price_rise'));
    }

    public function test_an_alert_whose_second_switch_was_on_keeps_its_row_as_it_was(): void
    {
        AlertSwitch::setAll('owner_stock_reorder', true);
        SmsTypeRegistry::setTelegramEnabled('owner_stock_reorder', false);
        SiteSetting::set('ops_inventory_reorder_alert_sms', '1');

        $this->migrate();

        $this->assertSame(['sms' => true, 'email' => true, 'telegram' => false], $this->channels('owner_stock_reorder'));
    }

    public function test_a_shared_switch_becomes_one_per_text_starting_from_its_value(): void
    {
        foreach (['sms_catering_request_received_enabled', 'sms_catering_quote_staff_enabled', 'sms_reservation_reminder_enabled', 'sms_customer_payment_confirmed_pos_enabled', 'sms_customer_payment_confirmed_online_enabled'] as $key) {
            DB::table('site_settings')->where('key', $key)->delete();
            SiteSetting::forgetScoped($key);
        }
        SiteSetting::set('sms_catering_enabled', 'false');
        SiteSetting::set('sms_reservation_enabled', 'true');
        SiteSetting::set('sms_customer_payment_confirmed_enabled', 'false');

        $this->migrate();

        $this->assertSame('false', SiteSetting::get('sms_catering_request_received_enabled'));
        $this->assertSame('false', SiteSetting::get('sms_catering_quote_staff_enabled'));
        $this->assertSame('true', SiteSetting::get('sms_reservation_reminder_enabled'));
        $this->assertSame('false', SiteSetting::get('sms_customer_payment_confirmed_pos_enabled'));
        $this->assertSame('false', SiteSetting::get('sms_customer_payment_confirmed_online_enabled'));
    }

    public function test_zero_meaning_off_becomes_the_switch_and_the_number_its_default(): void
    {
        AlertSwitch::setAll('owner_shift_left_open', true);
        SiteSetting::set('ops_shift_open_alert_hours', '0');

        $this->migrate();

        $this->assertFalse(AlertSwitch::isOn('owner_shift_left_open'));
        $this->assertSame('14', SiteSetting::get('ops_shift_open_alert_hours'));
    }

    public function test_staff_order_confirmed_keeps_needing_what_it_needed(): void
    {
        SiteSetting::set('staff_sms_order_confirmed_enabled', '1');
        SiteSetting::set('staff_sms_other_enabled', '0');

        $this->migrate();

        $this->assertFalse(SmsTypeRegistry::isTypeEnabled(SmsTypeRegistry::get('staff_order_confirmed')));
        $this->assertNotNull(SmsTemplate::where('slug', 'order_confirmed')->first());
    }

    public function test_queued_marketing_shift_reminders_are_cancelled(): void
    {
        $reminder = SmsScheduledMessage::create([
            'name' => 'Shift reminder: Ali on 12 Oct',
            'to_type' => 'contact',
            'is_recurring' => false,
            'send_at' => now()->addDay(),
            'next_send_at' => now()->addDay(),
            'status' => 'active',
        ]);
        $other = SmsScheduledMessage::create([
            'name' => 'Weekend promo',
            'to_type' => 'contact',
            'is_recurring' => false,
            'send_at' => now()->addDay(),
            'next_send_at' => now()->addDay(),
            'status' => 'active',
        ]);

        $this->migrate();

        $this->assertSame('cancelled', $reminder->fresh()->status);
        $this->assertSame('active', $other->fresh()->status);
    }

    public function test_an_alert_with_every_channel_off_is_off_and_any_one_channel_turns_it_on(): void
    {
        AlertSwitch::setAll('owner_late_payment', false);
        $this->assertFalse(AlertSwitch::isOn('owner_late_payment'));

        SmsTypeRegistry::setEmailEnabled('owner_late_payment', true);
        $this->assertTrue(AlertSwitch::isOn('owner_late_payment'));
    }
}
