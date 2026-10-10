<?php

declare(strict_types=1);

use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Notifications audit, 2026-10-10 (owner: "all"): one switch per channel on
 * each message's row in Admin → Notifications, and nothing else.
 *
 * Nothing that sends today stops, and nothing new starts:
 *
 * - Second switches are folded into the row. An alert whose second switch
 *   is off sends nothing today, so every channel on its row is switched off;
 *   one whose second switch is on keeps its row exactly as it is.
 * - A "0 means off" number: the alert is switched off on its row and the
 *   number goes back to its default, so the number only says when it sends.
 * - Shared switches are split; each text starts from the shared value.
 * - Staff "order confirmed" needed "Staff: other order alerts" on as well;
 *   it keeps that state, and gets its own wording copied from "new order".
 * - Shift reminders queued as scheduled marketing messages are cancelled;
 *   staff:shift-reminders sends them as staff alerts from now on.
 *
 * The old settings are left where they are, unread, so this can be undone.
 */
return new class extends Migration
{
    /** Second switch → the rows it gated, with its old default. */
    private const FOLDED = [
        ['ops_inventory_reorder_alert_sms', '0', ['owner_stock_reorder', 'owner_stock_expiry']],
        ['ops_price_rise_alert_sms', '0', ['owner_price_rise']],
        ['ops_delivery_delay_alert_sms', '0', ['owner_delivery_delays']],
        ['signage_device_alert_sms', '1', ['owner_signage_devices']],
        ['social_approval_sms', '1', ['owner_social_approval']],
        ['social_weekly_digest', '1', ['owner_social_digest']],
        ['ops_complaint_weekly_sms', '0', ['owner_complaint_digest']],
        ['ops_complaint_stale_sms', '1', ['owner_complaint_stale']],
    ];

    /** Shared switch → the per-text switches it becomes, with its old default. */
    private const SPLIT = [
        ['sms_customer_payment_confirmed_enabled', 'true', ['sms_customer_payment_confirmed_pos_enabled', 'sms_customer_payment_confirmed_online_enabled']],
        ['sms_marketing_campaigns_enabled', '1', ['sms_admin_direct_enabled']],
        ['sms_catering_enabled', 'true', [
            'sms_catering_request_received_enabled', 'sms_catering_request_staff_enabled',
            'sms_catering_confirmed_customer_enabled', 'sms_catering_confirmed_staff_enabled',
            'sms_catering_quote_customer_enabled', 'sms_catering_quote_staff_enabled',
            'sms_catering_lifecycle_customer_enabled', 'sms_catering_lifecycle_staff_enabled',
        ]],
        ['sms_reservation_enabled', 'true', [
            'sms_reservation_received_enabled', 'sms_reservation_confirmed_enabled',
            'sms_reservation_reminder_enabled', 'sms_reservation_cancelled_enabled',
        ]],
    ];

    /** "0 means off" number → its default and the rows it gated. */
    private const ZERO_OFF = [
        ['ops_shift_open_alert_hours', '14', ['owner_shift_left_open']],
        ['ops_shift_variance_alert_mvr', '50', ['owner_shift_variance', 'owner_shift_float_mismatch']],
        ['ops_unstarted_order_alert_minutes', '10', ['owner_order_unstarted']],
    ];

    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        foreach (self::FOLDED as [$key, $default, $types]) {
            if (!$this->truthy(SiteSetting::get($key, $default), $default === '1')) {
                foreach ($types as $type) {
                    $this->switchOff($type);
                }
            }
        }

        foreach (self::SPLIT as [$shared, $default, $keys]) {
            $value = $this->truthy(SiteSetting::get($shared, $default), in_array($default, ['1', 'true'], true)) ? 'true' : 'false';
            foreach ($keys as $key) {
                if (SiteSetting::get($key) === null) {
                    SiteSetting::set($key, $value);
                }
            }
        }

        // Catering reminders: their own rows, on when both the catering
        // texts and the old reminder switch were on; the email and Telegram
        // switches follow the old "reminder / change" rows.
        $cateringOn = $this->truthy(SiteSetting::get('sms_catering_enabled', 'true'), true);
        $reminderOn = $this->truthy(SiteSetting::get('catering_reminder_enabled', '1'), true);
        foreach (['customer', 'staff'] as $who) {
            $new = "catering_reminder_{$who}";
            if (SiteSetting::get("sms_{$new}_enabled") === null) {
                SiteSetting::set("sms_{$new}_enabled", $cateringOn && $reminderOn ? 'true' : 'false');
            }
            $this->copyChannel(SmsTypeRegistry::EMAIL_SETTING_PREFIX, "catering_lifecycle_{$who}", $new);
            $this->copyChannel(SmsTypeRegistry::TELEGRAM_SETTING_PREFIX, "catering_lifecycle_{$who}", $new);
            if (!$reminderOn) {
                $this->switchOff($new);
            }
        }

        foreach (self::ZERO_OFF as [$key, $default, $types]) {
            $raw = SiteSetting::get($key);
            if ($raw !== null && $raw !== '' && (float) $raw <= 0) {
                foreach ($types as $type) {
                    $this->switchOff($type);
                }
                SiteSetting::set($key, $default);
            }
        }

        // GST: "0 days before" meant off.
        if (Schema::hasTable('gst_settings') && Schema::hasColumn('gst_settings', 'filing_reminder_days')) {
            $zero = DB::table('gst_settings')->where('filing_reminder_days', '<=', 0)->exists();
            if ($zero) {
                $this->switchOff('owner_gst_filing_due');
                DB::table('gst_settings')->where('filing_reminder_days', '<=', 0)->update(['filing_reminder_days' => 3]);
            }
        }

        // Staff "order confirmed": its SMS needed "Staff: other order alerts"
        // too; the email and Telegram copies followed that row's switches.
        if (!$this->truthy(SiteSetting::get('staff_sms_other_enabled', '1'), true)) {
            SiteSetting::set('staff_sms_order_confirmed_enabled', '0');
        }
        $this->copyChannel(SmsTypeRegistry::EMAIL_SETTING_PREFIX, 'staff_notification', 'staff_order_confirmed');
        $this->copyChannel(SmsTypeRegistry::TELEGRAM_SETTING_PREFIX, 'staff_notification', 'staff_order_confirmed');

        if (Schema::hasTable('sms_templates') && !DB::table('sms_templates')->where('slug', 'order_confirmed')->exists()) {
            $newOrder = DB::table('sms_templates')->where('slug', 'order_new')->first();
            DB::table('sms_templates')->insert([
                'slug' => 'order_confirmed',
                'name' => 'Order Confirmed',
                'type' => 'order_notification',
                'body' => $newOrder->body ?? 'Order #{{order_number}} confirmed ({{order_type}}). {{item_count}} item(s). Total: {{total}}. Customer: {{customer_phone}}.',
                'description' => 'Sent to staff when an order is paid or started.',
                'is_system' => true,
                'variables' => $newOrder->variables ?? json_encode([
                    ['name' => 'order_type', 'description' => 'Type of order: dine-in, takeaway, delivery'],
                    ['name' => 'order_number', 'description' => 'Order reference number'],
                    ['name' => 'item_count', 'description' => 'Number of items in the order'],
                    ['name' => 'total', 'description' => 'Order total (formatted, e.g. MVR 12.50)'],
                    ['name' => 'customer_phone', 'description' => 'Customer phone number'],
                ]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Shift reminders: staff:shift-reminders sends them now. Those still
        // waiting in the scheduled-message queue would go a second time, as
        // marketing, so they are cancelled.
        if (Schema::hasTable('sms_scheduled_messages')) {
            DB::table('sms_scheduled_messages')
                ->where('status', 'active')
                ->where('is_recurring', false)
                ->where('name', 'like', 'Shift reminder: %')
                ->update(['status' => 'cancelled', 'updated_at' => now()]);
        }

        SiteSetting::bust();
    }

    public function down(): void
    {
        // The old settings were never removed, and the code that read them is
        // what changed; rolling the code back restores the old behaviour.
    }

    /** Every channel off on one row: what "the alert is off" means now. */
    private function switchOff(string $type): void
    {
        $entry = SmsTypeRegistry::get($type);
        if ($entry !== null && !empty($entry['enabled_setting'])) {
            SiteSetting::set((string) $entry['enabled_setting'], 'false');
        }
        SiteSetting::set(SmsTypeRegistry::EMAIL_SETTING_PREFIX . $type, 'off');
        SiteSetting::set(SmsTypeRegistry::TELEGRAM_SETTING_PREFIX . $type, 'off');
    }

    /** A channel switch the old row had off carries over to the new row. */
    private function copyChannel(string $prefix, string $from, string $to): void
    {
        $old = SiteSetting::get($prefix . $from);
        if ($old !== null && SiteSetting::get($prefix . $to) === null) {
            SiteSetting::set($prefix . $to, (string) $old);
        }
    }

    private function truthy(mixed $value, bool $default): bool
    {
        return SmsTypeRegistry::settingIsTruthy($value, $default);
    }
};
