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
    ];

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
