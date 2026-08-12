<?php

declare(strict_types=1);

namespace App\Domains\Content;

use App\Services\DeliveryGateService;
use App\Services\FeatureGateService;
use App\Services\OnlineOrderingGateService;
use Carbon\Carbon;

/**
 * Builds website home "Order mode cards" to match the order-app ModeEntryCards.
 *
 * Copy comes from order_app content keys so CMS edits stay in sync; availability
 * uses the same gates as GET /api/ordering/status.
 */
final class ModeEntryCardsPresenter
{
    public const MODES = ['delivery', 'pickup', 'dine_in'];

    private const DEFAULT_HINTS = [
        'delivery' => 'Delivered to your door',
        'pickup' => 'Collect from our shop',
        'dine_in' => 'Order and pay online — your table is held for you and food is ready when you arrive.',
    ];

    private const DEFAULT_INFO = [
        'delivery' => 'We bring your order to your door. Choose your address at checkout and track it on the way.',
        'pickup' => 'Order online, then collect from our shop when it is ready. No need to wait in a queue to order.',
        'dine_in' => 'Order and pay online, and your table is held for you. Food is ready when you arrive — no prepaid jargon, just a seat waiting.',
    ];

    private const LABELS = [
        'delivery' => 'Delivery',
        'pickup' => 'Pickup',
        'dine_in' => 'Eat here',
    ];

    private const ICONS = [
        'delivery' => '🛵',
        'pickup' => '🏪',
        'dine_in' => '🍽️',
    ];

    /** Public URLs — prefer /images/modes so missing files 404 instead of the order SPA HTML. */
    private const IMAGES = [
        'delivery' => '/images/modes/mode-delivery.jpg',
        'pickup' => '/images/modes/mode-pickup.jpg',
        'dine_in' => '/images/modes/mode-dinein.jpg',
    ];

    /**
     * @return list<array{
     *   kind: string,
     *   label: string,
     *   hint: string,
     *   status_line: string|null,
     *   available: bool,
     *   cta: string,
     *   href: string|null,
     *   info: string,
     *   image: string|null,
     *   icon: string,
     * }>
     */
    public static function cards(?string $locale = null): array
    {
        $locale ??= app()->bound('content.locale') ? (string) app('content.locale') : 'en';
        // order_mode_* keys now target both apps (website + order_app) so Website
        // can edit them directly. Resolve with the website app — the chain still
        // falls through to shared/registry defaults when unset.
        $copy = ContentResolver::for('website', $locale);
        $gate = self::resolveGatePayload();

        $statusAvailable = (string) $copy->get('order_mode_status_available', 'Available now');
        $statusUnavailable = (string) $copy->get('order_mode_status_unavailable', 'Unavailable right now');
        $statusUnavailableOpens = (string) $copy->get('order_mode_status_unavailable_opens', 'Closed until {time}');
        $learnMore = (string) $copy->get('order_mode_learn_more', 'Learn more');

        $hints = [
            'delivery' => self::buildDeliveryHint($copy),
            'pickup' => self::buildPickupHint($copy),
            'dine_in' => self::trimmedOr(
                (string) $copy->get('order_mode_dine_in_hint', ''),
                self::DEFAULT_HINTS['dine_in'],
            ),
        ];

        $info = [
            'delivery' => (string) $copy->get('order_mode_delivery_info', self::DEFAULT_INFO['delivery']),
            'pickup' => (string) $copy->get('order_mode_pickup_info', self::DEFAULT_INFO['pickup']),
            'dine_in' => (string) $copy->get('order_mode_dine_in_info', self::DEFAULT_INFO['dine_in']),
        ];

        $cards = [];
        foreach (self::MODES as $kind) {
            $state = $gate[$kind];
            $available = $state['available'];
            $statusLine = $available ? null : self::statusFor($state, $statusAvailable, $statusUnavailable, $statusUnavailableOpens);
            $label = self::LABELS[$kind];

            $cards[] = [
                'kind' => $kind,
                'label' => $label,
                'hint' => $available ? $hints[$kind] : ($statusLine ?? $hints[$kind]),
                'status_line' => $statusLine,
                'available' => $available,
                'cta' => $available ? "{$label} →" : "{$learnMore} →",
                'href' => $available ? '/order/menu?mode='.$kind : null,
                'info' => $info[$kind],
                'image' => self::resolveImageUrl($kind),
                'icon' => self::ICONS[$kind],
            ];
        }

        return $cards;
    }

    public static function resolveImageUrl(string $kind): ?string
    {
        $url = self::IMAGES[$kind] ?? null;
        if ($url === null) {
            return null;
        }

        $relative = ltrim($url, '/');
        if (is_file(public_path($relative))) {
            return $url;
        }

        // Fallback used by the order app build (same filenames).
        $orderRelative = 'order/images/'.basename($relative);
        if (is_file(public_path($orderRelative))) {
            return '/'.$orderRelative;
        }

        return null;
    }

    /**
     * @return array<string, array{available: bool, owner_disabled: bool, next_open_iso: string|null}>
     */
    public static function resolveGatePayload(): array
    {
        $status = app(OnlineOrderingGateService::class)->status();
        $deliveryStatus = app(DeliveryGateService::class)->status();
        $featureGates = app(FeatureGateService::class);

        $shopOpen = (bool) ($status['open'] ?? false);
        $deliveryAvailable = $shopOpen && (bool) ($deliveryStatus['delivery_open'] ?? false);

        $modes = [
            'pickup' => [
                'enabled' => $featureGates->enabled('pickup_ordering'),
                'open' => $shopOpen && $featureGates->open('pickup_ordering'),
            ],
            'delivery' => [
                'enabled' => (bool) ($deliveryStatus['accepting_flag'] ?? true),
                'open' => $deliveryAvailable,
            ],
            'dine_in' => [
                'enabled' => $featureGates->enabled('dine_in_preorder'),
                'open' => $shopOpen && $featureGates->open('dine_in_preorder'),
            ],
        ];

        $nextOpen = $status['next_open_window'] ?? null;
        $nextDelivery = $deliveryStatus['next_delivery_window'] ?? null;

        return [
            'pickup' => [
                'available' => (bool) $modes['pickup']['open'],
                'owner_disabled' => $modes['pickup']['enabled'] === false,
                'next_open_iso' => $modes['pickup']['open'] ? null : $nextOpen,
            ],
            'delivery' => [
                'available' => (bool) $modes['delivery']['open'],
                'owner_disabled' => $modes['delivery']['enabled'] === false,
                'next_open_iso' => $modes['delivery']['open'] ? null : ($nextDelivery ?? $nextOpen),
            ],
            'dine_in' => [
                'available' => (bool) $modes['dine_in']['open'],
                'owner_disabled' => $modes['dine_in']['enabled'] === false,
                'next_open_iso' => $modes['dine_in']['open'] ? null : $nextOpen,
            ],
        ];
    }

    /**
     * @param  array{available: bool, owner_disabled: bool, next_open_iso: string|null}  $state
     */
    public static function statusFor(
        array $state,
        string $statusAvailable,
        string $statusUnavailable,
        string $statusUnavailableOpens,
    ): string {
        if ($state['available']) {
            return $statusAvailable;
        }
        if ($state['owner_disabled']) {
            return $statusUnavailable;
        }
        $time = self::formatWindowTime($state['next_open_iso'] ?? null);
        if ($time !== '') {
            return str_replace('{time}', $time, $statusUnavailableOpens);
        }

        return $statusUnavailable;
    }

    public static function formatWindowTime(?string $iso): string
    {
        if ($iso === null || $iso === '') {
            return '';
        }

        try {
            $d = Carbon::parse($iso);
        } catch (\Throwable) {
            return '';
        }

        $timeStr = $d->format('g:i A');
        $sameDay = $d->isSameDay(Carbon::now($d->getTimezone()));

        return $sameDay ? $timeStr : $timeStr.' '.$d->format('D');
    }

    private static function buildDeliveryHint(ContentResolver $copy): string
    {
        $custom = self::trimmedOr((string) $copy->get('order_mode_delivery_hint', ''), '');
        if ($custom !== '') {
            return $custom;
        }

        // Delivery meta often lives on website/shared — fall back through website resolver.
        $website = $copy;
        $eta = self::trimmedOr((string) $website->get('delivery_time', ''), '')
            ?: self::trimmedOr((string) $website->get('delivery_eta', ''), '');
        $threshold = self::trimmedOr((string) $website->get('delivery_threshold', ''), '');
        $tagline = self::trimmedOr((string) $website->get('home_delivery_tagline', ''), '');

        if ($eta !== '' && $threshold !== '') {
            return "{$eta} · Free above {$threshold}";
        }
        if ($eta !== '') {
            return "Delivered to your door in {$eta}";
        }
        if ($tagline !== '') {
            return $tagline;
        }

        return self::DEFAULT_HINTS['delivery'];
    }

    private static function buildPickupHint(ContentResolver $copy): string
    {
        $custom = self::trimmedOr((string) $copy->get('order_mode_pickup_hint', ''), '');
        if ($custom !== '') {
            return $custom;
        }

        $website = ContentResolver::for('website', $copy->locale());
        $address = self::trimmedOr((string) $website->get('business_address', ''), '');
        $landmark = self::trimmedOr((string) $website->get('business_landmark', ''), '');

        if ($address !== '' && $landmark !== '') {
            return "Pick up at {$address} ({$landmark})";
        }
        if ($address !== '') {
            return "Pick up at {$address}";
        }

        return self::DEFAULT_HINTS['pickup'];
    }

    private static function trimmedOr(string $value, string $fallback): string
    {
        $trimmed = trim($value);

        return $trimmed !== '' ? $trimmed : $fallback;
    }
}
