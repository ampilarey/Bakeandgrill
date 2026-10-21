<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\SiteSetting;

/**
 * The few operational settings the till and the order app read by name from
 * the public settings payload, beside the Content Studio copy.
 *
 * GET /api/site-settings/public and GET /api/content?app=order_app are built
 * from the content registry, which carries wording and branding only. The
 * till's cart prices a dine-in ticket with the service charge from these keys
 * (useCart, parseServiceChargePublicSettings) and the order app's checkout
 * does the same, so without them the cart showed a total without the service
 * charge and Charge stopped with "Order total changed" on every dine-in sale
 * (found 2026-10-21 while the till stopped preselecting Dine-in). The keys
 * were public before the registry took over the payload; this list is the
 * deliberate set, read live from site_settings, never a second place to edit
 * them: Admin → Settings → Service charge and Delivery still own the values.
 */
final class PublicOperationalSettings
{
    /** @var list<string> */
    public const KEYS = [
        // Service charge (ServiceChargeSettingsController; the parser's keys).
        'service_charge_enabled',
        'service_charge_label',
        'service_charge_type',
        'service_charge_value',
        'service_charge_apply_dine_in',
        'service_charge_apply_takeaway',
        'service_charge_apply_online_pickup',
        'service_charge_apply_delivery',
        'service_charge_taxable',
        // The till's tap-chip note library (NotePickerModal).
        'pos_quick_notes',
        // The order app's delivery fee estimate while the preview loads.
        'delivery_default_fee',
        'delivery_free_threshold',
        'delivery_zone_fees',
    ];

    /**
     * Each key's stored value as a string, keys with no row left out so the
     * apps keep their defaults.
     *
     * @return array<string, string>
     */
    public static function values(): array
    {
        $out = [];
        foreach (self::KEYS as $key) {
            $value = SiteSetting::get($key);
            if ($value === null || $value === '') {
                continue;
            }
            $out[$key] = is_bool($value) ? ($value ? '1' : '0') : (string) $value;
        }

        return $out;
    }
}
