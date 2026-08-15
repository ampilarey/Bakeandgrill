<?php

declare(strict_types=1);

namespace App\Domains\Settings;

use App\Domains\Delivery\Services\DeliverySettingsService;
use App\Models\SiteSetting;

/**
 * Content Hub / public content keys that must not be independently edited
 * because an operational Admin page is the single source of truth.
 *
 * Public surfaces may *display* these values (via ContentResolver) but Admin
 * Content & Branding must not store a competing copy.
 */
final class OpsOwnedContent
{
    /**
     * Keys derived from Ordering Control → Delivery (not editable in Content Hub).
     *
     * @var array<string, array{owner_label: string, owner_path: string, note: string}>
     */
    public const DELIVERY_OPS = [
        'delivery_threshold' => [
            'owner_label' => 'Ordering Control Center → Delivery Settings',
            'owner_path' => '/admin/delivery-settings',
            'note' => 'Free delivery threshold used at checkout, invoices, receipts and public messaging.',
        ],
        'delivery_time' => [
            'owner_label' => 'Ordering Control Center → Delivery Settings',
            'owner_path' => '/admin/delivery-settings',
            'note' => 'Delivery promise shown to customers — kept beside the free-delivery threshold so the two cannot disagree.',
        ],
    ];

    /**
     * Shared business-profile keys owned by Business Details.
     * Content Hub may show a read-only summary; app-scoped content rows must not override them.
     *
     * @var list<string>
     */
    public const BUSINESS_DETAILS_KEYS = [
        'site_name',
        'business_website',
        'business_phone',
        'business_email',
        'business_address',
        'business_address_line1',
        'business_address_city',
        'business_address_country',
        'business_landmark',
        'business_maps_url',
        'maps_embed_url',
        'business_whatsapp',
        'business_viber',

        // Owner decision 2026-08-14: one business, one identity. These were
        // independently editable per app; logo/primary_color/site_tagline were
        // ALSO editable in Business Details, so one logo had three homes and the
        // invoice copy (DocumentBrandView) could differ from the website's.
        'site_tagline',
        'logo',
        'logo_dark',
        'favicon',
        'og_image',
        'primary_color',
        'default_item_image',

        // One set of social accounts for the business.
        'show_social_links',
        'social_instagram',
        'social_facebook',
        'social_tiktok',

        // Visitor tracking — one property per business.
        'google_analytics_id',
        'google_tag_manager_id',

        // Menu rule, one business (owner decision 2026-08-14).
        'menu_new_days',
    ];

    /**
     * Single-owner keys are hidden from Content & Branding entirely — not shown
     * as read-only rows.
     *
     * Owner decision 2026-08-15: "Hide those read only boxes also." A row you
     * cannot edit, sitting among rows you can, reads as a setting to fix. It
     * cost him a trip looking for a Website delivery time that does not exist.
     * Business Details keys went first (2026-08-14); the two Delivery Settings
     * mirrors now follow.
     */
    public static function isHiddenFromContentHub(string $key): bool
    {
        return self::isWriteForbidden($key);
    }

    public static function isWriteForbidden(string $key): bool
    {
        return isset(self::DELIVERY_OPS[$key]) || in_array($key, self::BUSINESS_DETAILS_KEYS, true);
    }

    public static function writeForbiddenMessage(string $key): string
    {
        if (isset(self::DELIVERY_OPS[$key])) {
            $meta = self::DELIVERY_OPS[$key];

            return "{$key} is managed in {$meta['owner_label']} — Content & Branding cannot change it.";
        }

        if (in_array($key, self::BUSINESS_DETAILS_KEYS, true)) {
            return "{$key} is managed in Business Details — Content & Branding cannot change it.";
        }

        return "{$key} cannot be edited here.";
    }

    public static function resolvesFromBusinessDetails(string $key): bool
    {
        return in_array($key, self::BUSINESS_DETAILS_KEYS, true);
    }

    public static function isDeliveryOpsMirror(string $key): bool
    {
        return isset(self::DELIVERY_OPS[$key]);
    }

    /**
     * Display string for free-delivery marketing (e.g. "MVR 200").
     */
    public static function freeDeliveryThresholdLabel(?DeliverySettingsService $delivery = null): string
    {
        $service = $delivery ?? app(DeliverySettingsService::class);
        $amount = $service->freeThreshold();
        if ($amount <= 0) {
            return '';
        }

        if (abs($amount - round($amount)) < 0.001) {
            return 'MVR '.(string) (int) round($amount);
        }

        return 'MVR '.number_format($amount, 2, '.', '');
    }

    /**
     * Resolved public/display value when Content Hub must not own the copy.
     */
    public static function deriveResolvedValue(string $key): ?string
    {
        if ($key === 'delivery_threshold') {
            return self::freeDeliveryThresholdLabel();
        }

        if ($key === 'delivery_time') {
            $value = app(DeliverySettingsService::class)->deliveryTime();
            if ($value !== '') {
                return $value;
            }

            // Unset must not blank the promise on the live site — fall back to
            // the registry default exactly as the resolver would have.
            $default = \App\Domains\Content\ContentRegistry::default('delivery_time');

            return is_string($default) ? $default : '';
        }

        return null;
    }

    /**
     * Metadata for Admin Content Hub read-only cards.
     *
     * @return array{owner_label: string, owner_path: string, note: string, current_value: string|null}|null
     */
    public static function managedByMeta(string $key): ?array
    {
        if (isset(self::DELIVERY_OPS[$key])) {
            $meta = self::DELIVERY_OPS[$key];

            return [
                'owner_label' => $meta['owner_label'],
                'owner_path' => $meta['owner_path'],
                'note' => $meta['note'],
                'current_value' => self::deriveResolvedValue($key),
            ];
        }

        if (in_array($key, self::BUSINESS_DETAILS_KEYS, true)) {
            $value = SiteSetting::getScoped($key, 'shared', 'en');
            if ($value === null || $value === '') {
                $value = SiteSetting::get($key);
            }

            return [
                'owner_label' => 'Business Details',
                'owner_path' => '/admin/business-details',
                'note' => 'Shared operational business profile used on receipts, invoices, signage and public contact.',
                'current_value' => $value !== null && $value !== '' ? (string) $value : null,
            ];
        }

        return null;
    }
}
