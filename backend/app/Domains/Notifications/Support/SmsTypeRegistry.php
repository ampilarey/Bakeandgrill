<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Models\SiteSetting;
use Illuminate\Support\Facades\Log;

/**
 * Single catalog of every SMS type in the system.
 *
 * UI, seeding, and SmsService::send() all read from here.
 *
 * @phpstan-type SmsTypeDef array{
 *   key: string,
 *   label: string,
 *   category: 'auth'|'transactional'|'marketing'|'staff'|'system',
 *   default_enabled: bool,
 *   suppressible: bool,
 *   template_slug: string|null,
 *   enabled_setting: string|null,
 *   send_permission: string|null,
 *   always_on: bool,
 *   recipients: string,
 *   user_initiated: bool
 * }
 */
final class SmsTypeRegistry
{
    public const GLOBAL_KILL_SWITCH = 'sms_global_kill_switch';

    public const SEND_PERMISSION_SETTING_PREFIX = 'sms_type_send_permission.';

    /**
     * Permissions that actually govern sending an SMS type.
     * Used for Control Center "who can send" options and PATCH validation.
     * Do not include management-only perms (templates.edit, settings.manage).
     *
     * @var list<string>
     */
    public const ASSIGNABLE_SEND_PERMISSIONS = [
        'sms.campaigns.send',
        'sms.transactional.manage',
        'orders.send_sms_bill',
        'orders.send_payment_link',
        'promotions.discounts',
        'promotions.discount_override',
        'service_availability.notify',
    ];

    /** Sentinel for system-initiated types (no manual staff send). */
    public const SYSTEM_SEND_PERMISSION = '__system__';

    public const RECIPIENTS_SETTING_PREFIX = 'sms_type_recipients.';

    /**
     * Types whose recipients the owner chooses in the Control Center, with
     * where each goes when nothing is chosen. Types not listed here decide
     * their recipient in code (the ordering customer, the rostered staff
     * member) and cannot be redirected.
     *
     * @var array<string, 'owners_managers'|'business_phone'>
     */
    public const RECIPIENT_DEFAULTS = [
        'owner_stock_reorder' => 'owners_managers',
        'owner_stock_expiry' => 'owners_managers',
        'owner_price_rise' => 'owners_managers',
        'owner_delivery_delays' => 'business_phone',
        'owner_device_approval' => 'business_phone',
        'owner_signage_devices' => 'business_phone',
        'owner_complaint_stale' => 'owners_managers',
        'owner_complaint_digest' => 'owners_managers',
        'owner_social_channel' => 'business_phone',
        'owner_social_approval' => 'business_phone',
        'owner_social_comments' => 'business_phone',
        'owner_social_digest' => 'owners_managers',
        'owner_daily_refund_summary' => 'owners_managers',
        'owner_complaint_received' => 'owners_managers',
        'owner_complaint_box_received' => 'owners_managers',
        'trade_reconcile_mismatch_owner' => 'owners_managers',
    ];

    public const RECIPIENT_MODES = ['owners_managers', 'owner_only', 'business_phone', 'staff', 'custom'];

    /** @var array<string, string> Legacy SmsMessage.type → registry key */
    private const TYPE_ALIASES = [
        'otp' => 'auth_customer_otp',
        'staff_password_reset' => 'auth_staff_password_reset',
        'campaign' => 'marketing_campaign',
        'promotion' => 'marketing_promotion',
        'scheduled' => 'sms_scheduled',
    ];

    /**
     * Categories that never honour marketing opt-out when used as a legacy type.
     *
     * @var list<string>
     */
    private const NON_SUPPRESSIBLE_CATEGORIES = ['auth', 'transactional', 'staff', 'system'];

    /** @return list<SmsTypeDef> */
    public static function all(): array
    {
        return array_values(self::definitions());
    }

    /** @return array<string, SmsTypeDef> */
    public static function definitions(): array
    {
        static $defs = null;
        if ($defs !== null) {
            return $defs;
        }

        $rows = [
            // Auth (always on — only global kill switch can block)
            self::def('auth_customer_otp', 'Customer login OTP', 'auth', true, false, 'auth_customer_otp', null, null, true, 'The customer requesting login / verification', false),
            self::def('auth_staff_password_reset', 'Staff password reset OTP', 'auth', true, false, 'auth_staff_password_reset', null, null, true, 'The staff member resetting their password', false),
            self::def('discount_approval_otp', 'Discount approval OTP', 'system', true, false, 'discount_approval_otp', null, 'promotions.discounts', true, 'Approver staff with discount-override permission', true),

            // Customer / POS transactional
            self::def('customer_payment_confirmed_pos', 'Payment confirmed (POS)', 'transactional', true, false, 'customer_payment_confirmed_pos', 'sms_customer_payment_confirmed_enabled', 'sms.transactional.manage', false, 'The ordering customer', false),
            self::def('customer_payment_confirmed_online', 'Payment confirmed (online)', 'transactional', true, false, 'customer_payment_confirmed_online', 'sms_customer_payment_confirmed_enabled', 'sms.transactional.manage', false, 'The ordering customer', false),
            self::def('customer_completion_receipt', 'Completion receipt', 'transactional', true, false, 'customer_completion_receipt', 'sms_customer_completion_receipt_enabled', 'sms.transactional.manage', false, 'The ordering customer', false),
            self::def('customer_order_preparing', 'Order preparing', 'transactional', true, false, 'customer_order_preparing', 'sms_customer_preparing_enabled', 'sms.transactional.manage', false, 'The ordering customer', false),
            self::def('customer_order_ready', 'Order ready', 'transactional', true, false, 'customer_order_ready_pickup', 'sms_customer_ready_enabled', 'sms.transactional.manage', false, 'The ordering customer', false),
            self::def('customer_order_on_the_way', 'Order on the way', 'transactional', true, false, 'customer_order_on_the_way', 'sms_customer_on_the_way_enabled', 'sms.transactional.manage', false, 'The ordering customer', false),
            self::def('customer_refund_requested', 'Refund requested', 'transactional', true, false, 'customer_refund_requested', 'sms_customer_refund_requested_enabled', 'sms.transactional.manage', false, 'Refund phone (order phone or walk-in add)', false),
            self::def('customer_refund_completed', 'Refund completed', 'transactional', true, false, 'customer_refund_completed', 'sms_customer_refund_completed_enabled', 'sms.transactional.manage', false, 'Refund phone (order phone or walk-in add)', false),
            self::def('customer_refund_otp', 'Refund verification OTP', 'system', true, false, 'customer_refund_otp', null, 'sms.transactional.manage', true, 'Refund phone — customer reads code to cashier', true),
            self::def('pos_send_bill', 'POS send bill', 'transactional', true, false, 'customer_send_bill', 'sms_pos_send_bill_enabled', 'orders.send_sms_bill', false, 'The ordering customer', true),
            self::def('pos_send_pay_link', 'POS payment link', 'transactional', true, false, 'customer_send_pay_link', 'sms_pos_send_pay_link_enabled', 'orders.send_payment_link', false, 'The ordering customer', true),
            self::def('pos_fire_to_kitchen', 'Fire to kitchen', 'transactional', true, false, 'customer_fire_to_kitchen', 'sms_pos_fire_to_kitchen_enabled', 'sms.transactional.manage', false, 'The ordering customer', true),
            self::def('pos_receipt_resend', 'Receipt resend', 'transactional', true, false, 'customer_receipt_resend', 'sms_pos_receipt_resend_enabled', 'sms.transactional.manage', false, 'The ordering customer', true),

            // Staff
            self::def('staff_new_order', 'Staff: new order', 'staff', true, false, 'order_new', 'staff_sms_new_order_enabled', 'sms.transactional.manage', false, 'Assigned / on-shift staff (or fallback)', false),
            self::def('staff_order_ready', 'Staff: order ready', 'staff', true, false, 'order_ready', 'staff_sms_order_ready_enabled', 'sms.transactional.manage', false, 'Assigned / on-shift staff (or fallback)', false),
            self::def('staff_order_out_for_delivery', 'Staff: out for delivery', 'staff', true, false, 'order_out_for_delivery', 'staff_sms_order_out_for_delivery_enabled', 'sms.transactional.manage', false, 'Assigned / on-shift staff (or fallback)', false),
            self::def('staff_no_staff_found', 'Staff: no staff found', 'staff', true, false, 'no_staff_found', 'staff_sms_no_staff_found_enabled', 'sms.transactional.manage', false, 'Fallback staff / managers', false),
            self::def('staff_new_customer', 'Staff: new customer', 'staff', true, false, 'customer_new', 'staff_sms_new_customer_enabled', 'sms.transactional.manage', false, 'Configured staff recipients', false),
            self::def('staff_refund_requested', 'Staff: refund awaiting approval', 'staff', true, false, 'staff_refund_requested', 'sms_staff_refund_requested_enabled', 'sms.transactional.manage', false, 'Staff with orders.refund', false),
            self::def('owner_daily_refund_summary', 'Owner: daily refund summary', 'staff', true, false, 'owner_daily_refund_summary', 'sms_owner_daily_refund_summary_enabled', 'sms.transactional.manage', false, 'Owner phone(s)', false),
            // Complaints — owner alert never suppressed by customer opt-out; customer ack/resolved honour opt-out.
            self::def('owner_complaint_received', 'Owner: complaint received', 'staff', true, false, 'owner_complaint_received', 'sms_owner_complaint_received_enabled', 'sms.transactional.manage', false, 'Owner phone(s)', false),
            self::def('customer_complaint_acknowledged', 'Complaint acknowledged', 'transactional', true, true, 'customer_complaint_acknowledged', 'sms_customer_complaint_acknowledged_enabled', 'sms.transactional.manage', false, 'Order / receipt customer phone', false),
            self::def('customer_complaint_resolved', 'Complaint resolved', 'transactional', true, true, 'customer_complaint_resolved', 'sms_customer_complaint_resolved_enabled', 'sms.transactional.manage', false, 'Order / receipt customer phone', false),
            // Complaint box (owner, 2026-09-19): the public form, separate from receipt complaints.
            self::def('owner_complaint_box_received', 'Owner: complaint box — new complaint', 'staff', true, false, 'owner_complaint_box_received', 'sms_owner_complaint_box_received_enabled', 'sms.transactional.manage', false, 'Owner phone(s)', false),
            self::def('customer_complaint_box_acknowledged', 'Complaint box: received', 'transactional', true, true, 'customer_complaint_box_acknowledged', 'sms_customer_complaint_box_acknowledged_enabled', 'sms.transactional.manage', false, 'The number the customer typed on the form', false),
            self::def('customer_complaint_box_update', 'Complaint box: update from owner', 'transactional', true, true, 'customer_complaint_box_update', 'sms_customer_complaint_box_update_enabled', 'sms.transactional.manage', false, 'The number the customer typed on the form', true),

            // Marketing
            self::def('marketing_campaign', 'Bulk campaign', 'marketing', true, true, null, 'sms_marketing_campaigns_enabled', 'sms.campaigns.send', false, 'Campaign audience', true),
            self::def('marketing_promotion', 'SMS blast (old system)', 'marketing', true, true, null, 'sms_marketing_promotions_enabled', 'sms.campaigns.send', false, 'Promotion audience', true),
            self::def('admin_direct', 'Admin direct SMS', 'marketing', true, true, null, 'sms_marketing_campaigns_enabled', 'sms.campaigns.send', false, 'Selected customer', true),
            self::def('marketing_abandoned_cart', 'Abandoned cart', 'marketing', true, true, null, 'marketing_abandoned_cart_enabled', 'sms.campaigns.send', false, 'Customers with abandoned carts', false),
            self::def('marketing_birthday', 'Birthday offer', 'marketing', true, true, null, 'marketing_birthday_enabled', 'sms.campaigns.send', false, 'Customers with birthday today', false),
            self::def('marketing_tier_milestone', 'Tier milestone', 'marketing', true, true, null, 'marketing_tier_milestone_enabled', 'sms.campaigns.send', false, 'Loyalty members hitting a tier', false),
            self::def('sms_scheduled', 'Scheduled / recurring message', 'marketing', true, true, null, 'sms_scheduled_enabled', null, false, 'The contact or group chosen on the message', false),

            // Catering (shared enabled toggle)
            self::def('catering_request_received', 'Catering request received', 'transactional', true, false, 'catering_request_received', 'sms_catering_enabled', 'sms.transactional.manage', false, 'The event contact', false),
            self::def('catering_request_staff', 'Catering request (staff)', 'staff', true, false, 'catering_request_staff', 'sms_catering_enabled', 'sms.transactional.manage', false, 'Catering / ops staff', false),
            self::def('catering_confirmed_customer', 'Catering confirmed (customer)', 'transactional', true, false, 'catering_confirmed_customer', 'sms_catering_enabled', 'sms.transactional.manage', false, 'The event contact', false),
            self::def('catering_confirmed_staff', 'Catering confirmed (staff)', 'staff', true, false, 'catering_confirmed_staff', 'sms_catering_enabled', 'sms.transactional.manage', false, 'Catering / ops staff', false),

            // Gift card + restoration
            self::def('giftcard_delivery', 'Gift card delivery', 'transactional', true, false, 'giftcard_delivery', 'sms_giftcard_enabled', 'sms.transactional.manage', false, 'Gift card recipient phone', false),
            // suppressible=false: legacy callers used type transactional (non-suppressible)
            self::def('service_restoration', 'Service restoration', 'marketing', true, false, 'service_restoration', 'sms_restoration_enabled', 'service_availability.notify', false, 'Customers who signed up for notify-me', true),

            // Wholesale consignment (Stage B+C) — shop dispatch respects sms_opt_out in TradeSmsNotifier;
            // registry marks suppressible so SmsService also honours opt-out.
            self::def('trade_dispatch_shop', 'Wholesale dispatch (shop)', 'transactional', true, true, 'trade_dispatch_shop', null, 'trade.dispatch', false, 'Shop contact / customer phone', true),
            self::def('trade_reconcile_mismatch_owner', 'Wholesale reconcile mismatch (owner)', 'staff', true, false, 'trade_reconcile_mismatch_owner', null, 'trade.reconcile', false, 'Owner phone(s)', false),

            // SMS audit, 2026-09-24: the twenty-six paths that still sent under
            // the old category labels ("system", "transactional",
            // "staff_notification") and so had no switch, no cost line and no
            // recipient choice in the Control Center. Each is its own type now.

            // Customer transactional (message set in code; no template)
            self::def('customer_order_confirmed', 'Order confirmed (at creation)', 'transactional', true, false, null, 'sms_customer_order_confirmed_enabled', 'sms.transactional.manage', false, 'The ordering customer', false),
            self::def('reservation_received', 'Reservation request received', 'transactional', true, false, null, 'sms_reservation_enabled', 'sms.transactional.manage', false, 'The reservation phone', false),
            self::def('reservation_confirmed', 'Reservation confirmed', 'transactional', true, false, null, 'sms_reservation_enabled', 'sms.transactional.manage', false, 'The reservation phone', false),
            self::def('catering_quote_customer', 'Catering quote sent (customer)', 'transactional', true, false, null, 'sms_catering_enabled', 'sms.transactional.manage', false, 'The event contact', false),
            self::def('catering_quote_staff', 'Catering quote sent (staff)', 'staff', true, false, null, 'sms_catering_enabled', 'sms.transactional.manage', false, 'Catering / ops staff', false),
            self::def('catering_lifecycle_customer', 'Catering reminder / change (customer)', 'transactional', true, false, null, 'sms_catering_enabled', 'sms.transactional.manage', false, 'The event contact', false),
            self::def('catering_lifecycle_staff', 'Catering reminder / change (staff)', 'staff', true, false, null, 'sms_catering_enabled', 'sms.transactional.manage', false, 'Catering / ops staff', false),
            self::def('invoice_send', 'Invoice link', 'transactional', true, false, null, 'sms_invoice_send_enabled', 'sms.transactional.manage', false, 'The number staff typed', true),
            self::def('credit_payment_reminder', 'Credit payment reminder', 'transactional', true, false, null, 'sms_credit_reminder_enabled', 'sms.transactional.manage', false, 'Credit customers with invoices due (their own reminder switch applies too)', false),

            // Staff
            self::def('staff_low_stock_menu', 'Staff: menu item low stock', 'staff', true, false, null, 'staff_sms_low_stock_enabled', 'sms.transactional.manage', false, 'Owners & managers', false),
            self::def('staff_schedule_assigned', 'Staff: shift assigned', 'staff', true, false, 'schedule_assigned', 'staff_sms_schedule_assigned_enabled', 'sms.transactional.manage', false, 'The rostered staff member', false),
            self::def('staff_notification', 'Staff: other order alerts', 'staff', true, false, null, 'staff_sms_other_enabled', 'sms.transactional.manage', false, 'Assigned / on-shift staff (or fallback)', false),
            // "Send a test to me" on a campaign: the exact text, opt-out line
            // included, to the signed-in staff member. Staff category, so it
            // never counts against a customer's marketing cap.
            self::def('staff_campaign_test', 'Campaign test to staff', 'staff', true, false, null, 'sms_marketing_campaigns_enabled', 'sms.campaigns.send', false, 'The signed-in staff member', true),

            // Owner alerts — recipients are chosen in the Control Center
            // (owners & managers, owner only, business phone, named staff,
            // or typed numbers). Some also have an older on/off switch on the
            // Settings page; both must be on.
            self::def('owner_stock_reorder', 'Owner: stock at reorder point', 'staff', true, false, null, 'sms_owner_stock_reorder_enabled', null, false, 'Owners & managers (also needs "Stock alert SMS" in Settings)', false),
            self::def('owner_stock_expiry', 'Owner: stock expiring', 'staff', true, false, null, 'sms_owner_stock_expiry_enabled', null, false, 'Owners & managers (also needs "Stock alert SMS" in Settings)', false),
            self::def('owner_price_rise', 'Owner: supplier price rises', 'staff', true, false, null, 'sms_owner_price_rise_enabled', null, false, 'Owners & managers (also needs the price-rise switch in Settings)', false),
            self::def('owner_delivery_delays', 'Owner: deliveries past ETA', 'staff', true, false, null, 'sms_owner_delivery_delays_enabled', null, false, 'Business phone (also needs the delivery-delay switch in Settings)', false),
            self::def('owner_device_approval', 'Owner: POS device waiting for approval', 'staff', true, false, null, 'sms_owner_device_approval_enabled', null, false, 'Business phone', false),
            self::def('owner_signage_devices', 'Owner: TV screen offline or stuck', 'staff', true, false, null, 'sms_owner_signage_devices_enabled', null, false, 'Business phone (also needs the TV alert switch in Signage)', false),
            self::def('owner_complaint_stale', 'Owner: complaints unread for days', 'staff', true, false, null, 'sms_owner_complaint_stale_enabled', null, false, 'Owners & managers', false),
            self::def('owner_complaint_digest', 'Owner: weekly complaint summary', 'staff', true, false, null, 'sms_owner_complaint_digest_enabled', null, false, 'Owners & managers', false),
            self::def('owner_social_channel', 'Owner: social channel failing or token expiring', 'staff', true, false, null, 'sms_owner_social_channel_enabled', null, false, 'Business phone', false),
            self::def('owner_social_approval', 'Owner: social post waiting for approval', 'staff', true, false, null, 'sms_owner_social_approval_enabled', null, false, 'Business phone (also the Social Hub approval-SMS switch)', false),
            self::def('owner_social_comments', 'Owner: social comments that look like orders', 'staff', true, false, null, 'sms_owner_social_comments_enabled', null, false, 'Business phone', false),
            self::def('owner_social_digest', 'Owner: weekly social digest', 'staff', true, false, null, 'sms_owner_social_digest_enabled', null, false, 'Owners & managers (also the Social Hub digest switch)', false),
        ];

        $defs = [];
        foreach ($rows as $row) {
            $defs[$row['key']] = $row;
        }

        return $defs;
    }

    /** @return SmsTypeDef|null */
    public static function get(string $key): ?array
    {
        return self::definitions()[$key] ?? null;
    }

    /**
     * Resolve a free-form SmsMessage.type to a registry entry.
     * Falls back to category-level rules for legacy callers (type: 'transactional').
     *
     * @return SmsTypeDef|null Null only when type is empty.
     */
    public static function resolve(string $type): ?array
    {
        $type = trim($type);
        if ($type === '') {
            return null;
        }

        $key = self::TYPE_ALIASES[$type] ?? $type;
        $exact = self::get($key);
        if ($exact !== null) {
            return $exact;
        }

        // Legacy category-level fallback (e.g. type: 'transactional')
        if (in_array($type, ['auth', 'transactional', 'marketing', 'staff', 'system'], true)) {
            Log::warning('SMS: legacy category type used — migrate caller to a registry key', ['type' => $type]);

            return self::categoryFallback($type);
        }

        Log::warning('SMS: unknown type — applying suppressible category fallback', ['type' => $type]);

        return self::categoryFallback('marketing', $type);
    }

    public static function isGlobalKillSwitchOn(): bool
    {
        return self::settingIsTruthy(SiteSetting::get(self::GLOBAL_KILL_SWITCH, 'false'), false);
    }

    public static function isTypeEnabled(array $entry): bool
    {
        if (!empty($entry['always_on'])) {
            return true;
        }

        $setting = $entry['enabled_setting'] ?? null;
        if ($setting === null || $setting === '') {
            return (bool) ($entry['default_enabled'] ?? true);
        }

        $defaultTruthy = (bool) ($entry['default_enabled'] ?? true);
        $raw = SiteSetting::get($setting, $defaultTruthy ? 'true' : 'false');

        return self::settingIsTruthy($raw, $defaultTruthy);
    }

    /**
     * Effective send_permission after Control Center overrides.
     * Returns null for system-initiated / no manual sending.
     */
    public static function effectiveSendPermission(array $entry): ?string
    {
        $key = (string) ($entry['key'] ?? '');
        if ($key === '') {
            return $entry['send_permission'] ?? null;
        }

        $override = SiteSetting::get(self::SEND_PERMISSION_SETTING_PREFIX . $key, null);
        if ($override === null || $override === '') {
            $perm = $entry['send_permission'] ?? null;

            return $perm !== null && $perm !== '' ? (string) $perm : null;
        }

        if ($override === self::SYSTEM_SEND_PERMISSION || $override === 'system') {
            return null;
        }

        return (string) $override;
    }

    public static function setSendPermissionOverride(string $typeKey, ?string $permissionSlug): void
    {
        $settingKey = self::SEND_PERMISSION_SETTING_PREFIX . $typeKey;
        if ($permissionSlug === null || $permissionSlug === '') {
            SiteSetting::set($settingKey, self::SYSTEM_SEND_PERMISSION);

            return;
        }

        SiteSetting::set($settingKey, $permissionSlug);
    }

    /**
     * Accepts legacy '1'/'0' (staff/marketing) and 'true'/'false' (customer SMS toggles).
     */
    public static function settingIsTruthy(mixed $value, bool $default = true): bool
    {
        if ($value === null || $value === '') {
            return $default;
        }

        if (is_bool($value)) {
            return $value;
        }

        $normalized = strtolower(trim((string) $value));

        if (in_array($normalized, ['1', 'true', 'on', 'yes'], true)) {
            return true;
        }

        if (in_array($normalized, ['0', 'false', 'off', 'no'], true)) {
            return false;
        }

        return $default;
    }

    public static function isSuppressible(array $entry): bool
    {
        return (bool) ($entry['suppressible'] ?? true);
    }

    /** Null when the type's recipient is decided in code. */
    public static function defaultRecipientMode(string $typeKey): ?string
    {
        return self::RECIPIENT_DEFAULTS[$typeKey] ?? null;
    }

    /**
     * The owner's recipient choice for a type, or null when none was made.
     *
     * @return array{mode: string, user_ids: list<int>, phones: list<string>}|null
     */
    public static function recipientOverride(string $typeKey): ?array
    {
        $raw = SiteSetting::get(self::RECIPIENTS_SETTING_PREFIX . $typeKey, null);
        $data = is_string($raw) ? json_decode($raw, true) : (is_array($raw) ? $raw : null);
        if (!is_array($data) || !in_array($data['mode'] ?? null, self::RECIPIENT_MODES, true)) {
            return null;
        }

        return [
            'mode' => (string) $data['mode'],
            'user_ids' => array_values(array_unique(array_map('intval', (array) ($data['user_ids'] ?? [])))),
            'phones' => array_values(array_unique(array_filter(array_map(fn ($p) => trim((string) $p), (array) ($data['phones'] ?? []))))),
        ];
    }

    /** @param array{mode: string, user_ids?: list<int>, phones?: list<string>}|null $choice null clears the choice */
    public static function setRecipientOverride(string $typeKey, ?array $choice): void
    {
        $key = self::RECIPIENTS_SETTING_PREFIX . $typeKey;
        SiteSetting::set($key, $choice === null ? '' : json_encode([
            'mode' => $choice['mode'],
            'user_ids' => array_values(array_map('intval', $choice['user_ids'] ?? [])),
            'phones' => array_values($choice['phones'] ?? []),
        ]));
        SiteSetting::bust();
    }

    public static function shouldRedactBody(string $type): bool
    {
        $entry = self::resolve($type);
        if ($entry === null) {
            return $type === 'otp';
        }

        return ($entry['category'] ?? '') === 'auth'
            || str_starts_with($entry['key'], 'auth_')
            || $entry['key'] === 'discount_approval_otp'
            || $entry['key'] === 'customer_refund_otp';
    }

    /**
     * Sample merge-variable values for Control Center live preview.
     *
     * @return array<string, string>
     */
    public static function sampleVariables(string $typeKey): array
    {
        return match ($typeKey) {
            'auth_customer_otp', 'auth_staff_password_reset', 'discount_approval_otp', 'customer_refund_otp' => [
                'code' => '123456',
                'minutes' => '10',
                'brand' => 'Bake & Grill',
                'amount' => '25.00',
                'order_number' => '1042',
            ],
            'pos_send_bill', 'pos_send_pay_link', 'pos_fire_to_kitchen', 'pos_receipt_resend',
            'customer_payment_confirmed_pos', 'customer_payment_confirmed_online',
            'customer_completion_receipt', 'customer_order_preparing', 'customer_order_ready',
            'customer_order_on_the_way' => [
                'greeting' => 'Hi Aisha!',
                'amount' => '128.50',
                'order_number' => '1042',
                'pay_url' => 'https://bakeandgrill.mv/pay/demo',
                'receipt_url' => 'https://bakeandgrill.mv/r/demo',
                'order_type' => 'delivery',
                'item_count' => '3',
                'total' => 'MVR 128.50',
                'customer_phone' => '7771234',
                'eta' => '25 min',
            ],
            'staff_new_order', 'staff_order_ready', 'staff_order_out_for_delivery', 'staff_no_staff_found', 'staff_new_customer' => [
                'order_type' => 'delivery',
                'order_number' => '1042',
                'item_count' => '3',
                'total' => 'MVR 128.50',
                'customer_phone' => '7771234',
                'customer_name' => 'Aisha',
            ],
            'giftcard_delivery' => [
                'sender' => 'From Ali',
                'amount' => 'MVR 100.00',
                'view_url' => 'https://bakeandgrill.mv/g/demo',
                'code' => 'GIFT-DEMO',
                'expires' => '31 Dec 2026',
                'note' => 'Happy birthday!',
            ],
            'owner_complaint_box_received', 'customer_complaint_box_acknowledged', 'customer_complaint_box_update' => [
                'reference' => 'CB-17',
                'category' => 'Staff behaviour',
                'staff' => ' about the cashier',
                'contact' => 'Customer left a number.',
                'message' => 'We have spoken to the staff member and it will not happen again. Thank you for telling us.',
            ],
            'service_restoration' => [
                'label' => 'Online Ordering',
                'url' => 'https://bakeandgrill.mv/order/menu',
                'service_key' => 'online_ordering',
                'incident_id' => '12',
            ],
            default => [
                'order_number' => '1042',
                'date' => 'Mon, 21 Apr',
                'start' => '09:00',
                'end' => '17:00',
                'reference' => 'EVT-DEMO',
                'view_url' => 'https://bakeandgrill.mv/order/events/mine/EVT-DEMO',
                'contact_name' => 'Aisha',
                'paid' => '500.00',
                'balance_bit' => '',
                'when' => 'Sat 2pm',
                'venue' => ' at Male\'',
                'code' => '123456',
                'minutes' => '10',
                'brand' => 'Bake & Grill',
                'receipt_url' => 'https://bakeandgrill.mv/r/demo',
            ],
        };
    }

    /**
     * @return SmsTypeDef
     */
    private static function categoryFallback(string $category, ?string $syntheticKey = null): array
    {
        $suppressible = !in_array($category, self::NON_SUPPRESSIBLE_CATEGORIES, true);

        return [
            'key' => $syntheticKey ?? $category,
            'label' => ucfirst($category) . ' (legacy)',
            'category' => $category,
            'default_enabled' => true,
            'suppressible' => $suppressible,
            'template_slug' => null,
            'enabled_setting' => null,
            'send_permission' => null,
            'always_on' => $category === 'auth',
            'recipients' => 'Legacy caller — recipient decided in code',
            'user_initiated' => false,
        ];
    }

    /**
     * @return SmsTypeDef
     */
    private static function def(
        string $key,
        string $label,
        string $category,
        bool $defaultEnabled,
        bool $suppressible,
        ?string $templateSlug,
        ?string $enabledSetting,
        ?string $sendPermission,
        bool $alwaysOn,
        string $recipients,
        bool $userInitiated,
    ): array {
        return [
            'key' => $key,
            'label' => $label,
            'category' => $category,
            'default_enabled' => $defaultEnabled,
            'suppressible' => $suppressible,
            'template_slug' => $templateSlug,
            'enabled_setting' => $enabledSetting,
            'send_permission' => $sendPermission,
            'always_on' => $alwaysOn,
            'recipients' => $recipients,
            'user_initiated' => $userInitiated,
        ];
    }
}
