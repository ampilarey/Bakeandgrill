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
 *   always_on: bool
 * }
 */
final class SmsTypeRegistry
{
    public const GLOBAL_KILL_SWITCH = 'sms_global_kill_switch';

    /** @var array<string, string> Legacy SmsMessage.type → registry key */
    private const TYPE_ALIASES = [
        'otp' => 'auth_customer_otp',
        'staff_password_reset' => 'auth_staff_password_reset',
        'campaign' => 'marketing_campaign',
        'promotion' => 'marketing_promotion',
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
            self::def('auth_customer_otp', 'Customer login OTP', 'auth', true, false, 'auth_customer_otp', null, null, true),
            self::def('auth_staff_password_reset', 'Staff password reset OTP', 'auth', true, false, 'auth_staff_password_reset', null, null, true),

            // Customer / POS transactional
            self::def('customer_payment_confirmed_pos', 'Payment confirmed (POS)', 'transactional', true, false, 'customer_payment_confirmed_pos', 'sms_customer_payment_confirmed_enabled', 'sms.transactional.manage'),
            self::def('customer_payment_confirmed_online', 'Payment confirmed (online)', 'transactional', true, false, 'customer_payment_confirmed_online', 'sms_customer_payment_confirmed_enabled', 'sms.transactional.manage'),
            self::def('customer_completion_receipt', 'Completion receipt', 'transactional', true, false, 'customer_completion_receipt', 'sms_customer_completion_receipt_enabled', 'sms.transactional.manage'),
            self::def('customer_order_preparing', 'Order preparing', 'transactional', true, false, 'customer_order_preparing', 'sms_customer_preparing_enabled', 'sms.transactional.manage'),
            self::def('customer_order_ready', 'Order ready', 'transactional', true, false, 'customer_order_ready_pickup', 'sms_customer_ready_enabled', 'sms.transactional.manage'),
            self::def('customer_order_on_the_way', 'Order on the way', 'transactional', true, false, 'customer_order_on_the_way', 'sms_customer_on_the_way_enabled', 'sms.transactional.manage'),
            self::def('pos_send_bill', 'POS send bill', 'transactional', true, false, 'customer_send_bill', 'sms_pos_send_bill_enabled', 'orders.send_sms_bill'),
            self::def('pos_send_pay_link', 'POS payment link', 'transactional', true, false, 'customer_send_pay_link', 'sms_pos_send_pay_link_enabled', 'orders.send_payment_link'),
            self::def('pos_fire_to_kitchen', 'Fire to kitchen', 'transactional', true, false, 'customer_fire_to_kitchen', 'sms_pos_fire_to_kitchen_enabled', 'sms.transactional.manage'),
            self::def('pos_receipt_resend', 'Receipt resend', 'transactional', true, false, 'customer_receipt_resend', 'sms_pos_receipt_resend_enabled', 'sms.transactional.manage'),

            // Staff
            self::def('staff_new_order', 'Staff: new order', 'staff', true, false, 'order_new', 'staff_sms_new_order_enabled', 'sms.transactional.manage'),
            self::def('staff_order_ready', 'Staff: order ready', 'staff', true, false, 'order_ready', 'staff_sms_order_ready_enabled', 'sms.transactional.manage'),
            self::def('staff_order_out_for_delivery', 'Staff: out for delivery', 'staff', true, false, 'order_out_for_delivery', 'staff_sms_order_out_for_delivery_enabled', 'sms.transactional.manage'),
            self::def('staff_no_staff_found', 'Staff: no staff found', 'staff', true, false, 'no_staff_found', 'staff_sms_no_staff_found_enabled', 'sms.transactional.manage'),
            self::def('staff_new_customer', 'Staff: new customer', 'staff', true, false, 'customer_new', 'staff_sms_new_customer_enabled', 'sms.transactional.manage'),

            // Marketing
            self::def('marketing_campaign', 'Bulk campaign', 'marketing', true, true, null, 'sms_marketing_campaigns_enabled', 'sms.campaigns.send'),
            self::def('marketing_promotion', 'SMS promotion', 'marketing', true, true, null, 'sms_marketing_promotions_enabled', 'sms.campaigns.send'),
            self::def('marketing_abandoned_cart', 'Abandoned cart', 'marketing', true, true, null, 'marketing_abandoned_cart_enabled', 'sms.campaigns.send'),
            self::def('marketing_birthday', 'Birthday offer', 'marketing', true, true, null, 'marketing_birthday_enabled', 'sms.campaigns.send'),
            self::def('marketing_tier_milestone', 'Tier milestone', 'marketing', true, true, null, 'marketing_tier_milestone_enabled', 'sms.campaigns.send'),

            // Catering (shared enabled toggle)
            self::def('catering_request_received', 'Catering request received', 'transactional', true, false, 'catering_request_received', 'sms_catering_enabled', 'sms.transactional.manage'),
            self::def('catering_request_staff', 'Catering request (staff)', 'staff', true, false, 'catering_request_staff', 'sms_catering_enabled', 'sms.transactional.manage'),
            self::def('catering_confirmed_customer', 'Catering confirmed (customer)', 'transactional', true, false, 'catering_confirmed_customer', 'sms_catering_enabled', 'sms.transactional.manage'),
            self::def('catering_confirmed_staff', 'Catering confirmed (staff)', 'staff', true, false, 'catering_confirmed_staff', 'sms_catering_enabled', 'sms.transactional.manage'),

            // Gift card + restoration
            self::def('giftcard_delivery', 'Gift card delivery', 'transactional', true, false, 'giftcard_delivery', 'sms_giftcard_enabled', 'sms.transactional.manage'),
            // suppressible=false: legacy callers used type transactional (non-suppressible)
            self::def('service_restoration', 'Service restoration', 'marketing', true, false, 'service_restoration', 'sms_restoration_enabled', 'service_availability.notify'),
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

    public static function shouldRedactBody(string $type): bool
    {
        $entry = self::resolve($type);
        if ($entry === null) {
            return $type === 'otp';
        }

        return ($entry['category'] ?? '') === 'auth' || str_starts_with($entry['key'], 'auth_');
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
        bool $alwaysOn = false,
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
        ];
    }
}
