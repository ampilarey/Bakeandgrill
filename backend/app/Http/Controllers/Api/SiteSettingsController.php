<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\ContentResolver;
use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SiteSettingsController extends Controller
{
    /** GET /api/site-settings/public — alias of GET /api/content?app=order_app */
    public function public(): JsonResponse
    {
        $settings = ContentResolver::for('order_app')->allPublic();

        return response()->json(['settings' => $settings]);
    }

    /**
     * The settings keys the generic write may touch.
     *
     * The write route was retired on 2026-08-14 when website copy moved to the
     * Content Resolver, and CmsContentTest pinned the retirement. Five admin
     * screens kept saving through it — Stock Corrections, Credit Accounts,
     * Online Ordering, SMS notifications and SMS automations — and have been
     * failing with 405 ever since. Found during the purchasing settings audit,
     * 2026-09-05.
     *
     * The route comes back narrow. This is every key those screens send, and
     * nothing else: website copy stays behind the resolver, and a key nobody
     * has deliberately listed is refused by name rather than silently written.
     * SiteSettingsWriteTest reads the admin source and fails if a screen ever
     * sends a key that is not here, so the 405 cannot come back as a 422.
     */
    public const WRITABLE_KEYS = [
        // Settings → Stock Corrections
        'stock_variance_reason_mvr',
        // Settings → Credit Accounts
        'credit_accounts_mode',
        'credit_limit_max_mvr',
        'credit_payment_terms_default_days',
        // Ordering Control: pickup slots, business hours, catering
        'pickup_slots_enabled',
        'pickup_slot_minutes',
        'pickup_slot_capacity',
        'business_hours',
        'catering_min_lead_hours',
        'catering_notify_email',
        'catering_notify_phone',
        'catering_ordering_closed_message',
        'catering_quote_min_hours_before_event',
        'catering_quote_valid_days',
        'catering_reminder_enabled',
        // Settings → Notifications (customer + POS SMS switches)
        'sms_customer_payment_confirmed_enabled',
        'sms_customer_completion_receipt_enabled',
        'sms_customer_preparing_enabled',
        'sms_customer_ready_enabled',
        'sms_customer_on_the_way_enabled',
        'sms_pos_send_bill_enabled',
        'sms_pos_send_pay_link_enabled',
        'sms_pos_fire_to_kitchen_enabled',
        'sms_pos_receipt_resend_enabled',
        // SMS → Automations (staff alerts)
        'staff_sms_new_order_enabled',
        'staff_sms_order_confirmed_enabled',
        'staff_sms_order_ready_enabled',
        'staff_sms_order_out_for_delivery_enabled',
        'staff_sms_no_staff_found_enabled',
        'staff_sms_schedule_assigned_enabled',
        'staff_sms_shift_reminder_enabled',
        'staff_sms_new_customer_enabled',
    ];

    /**
     * PUT /api/site-settings — write allowlisted settings keys.
     *
     * Body: `{ settings: { key: value|null } }`. Every key is checked before
     * anything is written, so a request with one bad key changes nothing.
     */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'settings' => ['required', 'array', 'min:1', 'max:50'],
        ]);

        $settings = $validated['settings'];
        $refused = [];
        foreach ($settings as $key => $value) {
            if (!is_string($key) || !in_array($key, self::WRITABLE_KEYS, true)) {
                $refused[] = (string) $key;
                continue;
            }
            if ($value !== null && !is_scalar($value)) {
                throw ValidationException::withMessages([
                    "settings.{$key}" => ["'{$key}' must be a plain value, not an object or list."],
                ]);
            }
            if (is_string($value) && strlen($value) > 20000) {
                throw ValidationException::withMessages([
                    "settings.{$key}" => ["'{$key}' is too long."],
                ]);
            }
        }

        if ($refused !== []) {
            throw ValidationException::withMessages([
                'settings' => [
                    'Not a settings key this route may write: ' . implode(', ', $refused)
                    . '. Website copy is edited through the Content Hub.',
                ],
            ]);
        }

        foreach ($settings as $key => $value) {
            SiteSetting::set($key, $value === null ? null : (string) $value);
        }
        SiteSetting::bust();

        $saved = [];
        foreach (array_keys($settings) as $key) {
            $saved[$key] = SiteSetting::get($key);
        }

        return response()->json(['message' => 'Settings saved.', 'settings' => $saved]);
    }

    /** GET /api/site-settings — owner only, returns shared-scope settings grouped for admin form */
    public function index(): JsonResponse
    {
        $query = SiteSetting::query()->orderBy('id');
        if (SiteSetting::hasScopeColumn()) {
            $query->where('scope', 'shared');
        }
        $grouped = $query->get()
            ->groupBy('group')
            ->map(fn ($items) => $items->values());

        return response()->json(['settings' => $grouped]);
    }
}
