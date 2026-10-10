<?php

declare(strict_types=1);

use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Models\SiteSetting;
use App\Rules\MaldivesPhone;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Notifications re-audit, 2026-10-10 (owner: "each notification need to be
 * controlled separately for sms, email, telegram; each user group settings
 * must be able to control group wise and each staff separately").
 *
 * Nothing that sends today stops, and nothing new starts:
 *
 * - Each alert's recipients become an audience (groups, named people,
 *   exceptions, typed numbers and emails). A row saved as one of the old
 *   modes is rewritten: owners & managers → the two roles; owner only → the
 *   owner role; business phone → the shop phone; named staff → those
 *   people; typed numbers → those numbers.
 * - The catering "notify phone / email" on Settings → Ordering become typed
 *   entries on the five catering staff rows, which is where they went.
 * - "Staff: new customer" went to the fallback staff; they become its named
 *   people, so the same phones ring.
 * - The three "email copies" switches (customers, staff, promotions) are
 *   gone: one that was off switches Email off on each row it covered.
 * - The wholesale "0 means off" numbers: 0 switches the row off and the
 *   number goes back to its default.
 * - The SMS log's "to" column grows so a typed email address fits.
 *
 * The old settings are left where they are, unread, so this can be undone.
 */
return new class extends Migration
{
    /** Old email-copies switch → the categories of rows it covered. */
    private const EMAIL_SWITCHES = [
        'sms_email_copy_customers' => ['auth', 'transactional', 'system'],
        'sms_email_copy_staff' => ['staff'],
        'sms_email_copy_marketing' => ['marketing'],
    ];

    /** "0 means off" number → its default and the row it gated. */
    private const ZERO_OFF = [
        ['trade_unreconciled_nudge_days', '3', 'trade_report_reminder_shop'],
        ['trade_unreconciled_alert_days', '7', 'owner_trade_unreconciled'],
    ];

    public function up(): void
    {
        if (Schema::hasTable('sms_logs')) {
            Schema::table('sms_logs', function (Blueprint $table): void {
                $table->string('to', 64)->change();
            });
        }
        if (Schema::hasTable('staff_notification_logs')) {
            Schema::table('staff_notification_logs', function (Blueprint $table): void {
                $table->string('phone', 64)->change();
            });
        }

        if (!Schema::hasTable('site_settings')) {
            return;
        }

        // Old recipient modes → audiences.
        $prefix = SmsTypeRegistry::RECIPIENTS_SETTING_PREFIX;
        foreach (DB::table('site_settings')->where('key', 'like', $prefix . '%')->get(['key', 'value']) as $row) {
            $data = json_decode((string) $row->value, true);
            if (!is_array($data) || !isset($data['mode']) || isset($data['groups'])) {
                continue;
            }
            SiteSetting::set((string) $row->key, json_encode(AlertAudience::fromLegacy($data)));
        }

        // Catering fallback phone / email → typed entries on the catering staff rows.
        $phone = trim((string) SiteSetting::get('catering_notify_phone', ''));
        $email = trim((string) SiteSetting::get('catering_notify_email', ''));
        if ($phone !== '' || $email !== '') {
            try {
                $phone = $phone !== '' ? MaldivesPhone::normalize($phone) : '';
            } catch (\Throwable) {
                $phone = '';
            }
            foreach (\App\Domains\Catering\Services\CateringNotifyRecipients::ALL_STAFF_TYPES as $type) {
                $audience = AlertAudience::for($type) ?? AlertAudience::default($type);
                if ($audience === null) {
                    continue;
                }
                if ($phone !== '') {
                    $audience['phones'][] = $phone;
                }
                if ($email !== '') {
                    $audience['emails'][] = $email;
                }
                AlertAudience::save($type, $audience);
            }
        }

        // "Staff: new customer": the fallback staff who got it keep getting it.
        if (Schema::hasTable('staff_notification_prefs') && AlertAudience::saved('staff_new_customer') === null) {
            $fallback = DB::table('staff_notification_prefs')
                ->join('users', 'users.id', '=', 'staff_notification_prefs.user_id')
                ->where('staff_notification_prefs.is_fallback', true)
                ->where('users.is_active', true)
                ->pluck('users.id')
                ->map(fn ($id) => (int) $id)
                ->all();
            if ($fallback !== []) {
                AlertAudience::save('staff_new_customer', ['groups' => [], 'users' => $fallback]);
            }
        }

        // Email copies switches → per-row Email off.
        foreach (self::EMAIL_SWITCHES as $key => $categories) {
            if (SmsTypeRegistry::settingIsTruthy(SiteSetting::get($key, '1'), true)) {
                continue;
            }
            foreach (SmsTypeRegistry::all() as $entry) {
                if (in_array($entry['category'], $categories, true) && in_array('email', SmsTypeRegistry::channels($entry), true) && empty($entry['always_on'])) {
                    SmsTypeRegistry::setEmailEnabled($entry['key'], false);
                }
            }
        }

        foreach (self::ZERO_OFF as [$key, $default, $type]) {
            $raw = SiteSetting::get($key);
            if ($raw !== null && $raw !== '' && (float) $raw <= 0) {
                $this->switchOff($type);
                SiteSetting::set($key, $default);
            }
        }

        SiteSetting::bust();
    }

    public function down(): void
    {
        // The old settings were never removed, and the code that read them is
        // what changed; rolling the code back restores the old behaviour. The
        // widened columns are harmless to keep.
    }

    /** Every channel off on one row: what "the alert is off" means now. */
    private function switchOff(string $type): void
    {
        $entry = SmsTypeRegistry::get($type);
        if ($entry !== null && !empty($entry['enabled_setting'])) {
            SiteSetting::set((string) $entry['enabled_setting'], 'false');
        }
        SmsTypeRegistry::setEmailEnabled($type, false);
        SmsTypeRegistry::setTelegramEnabled($type, false);
    }
};
