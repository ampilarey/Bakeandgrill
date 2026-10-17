<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\SiteSetting;
use App\Services\OpeningHoursService;

/**
 * Search-engine data for the website (iruali import plan, feature 11).
 *
 * The Restaurant block on every page reads the business details and the
 * Admin schedule, the one source for opening hours (OpeningHoursText reads the
 * same rows). Menu and dish blocks stay in their Blade pages; this adds the
 * shared pieces and breadcrumbs.
 */
final class StructuredData
{
    private const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    /** @return array<string, mixed> */
    public static function restaurant(string $name, string $description, string $logo): array
    {
        $phone = trim((string) SiteSetting::get('business_phone', config('business.phone', '')));
        $street = trim((string) SiteSetting::get('business_address', config('business.address.full', '')));

        return array_filter([
            '@context' => 'https://schema.org',
            '@type' => 'Restaurant',
            'name' => $name,
            'description' => $description !== '' ? $description : null,
            'url' => url('/'),
            'logo' => $logo,
            'image' => $logo,
            'telephone' => $phone !== '' ? $phone : null,
            'address' => array_filter([
                '@type' => 'PostalAddress',
                'streetAddress' => $street !== '' ? $street : null,
                'addressLocality' => 'Malé',
                'addressCountry' => 'MV',
            ], fn ($v) => $v !== null),
            'servesCuisine' => ['Maldivian', 'Grills', 'Bakery'],
            'priceRange' => 'MVR',
            'currenciesAccepted' => 'MVR',
            'hasMenu' => url('/menu'),
            'acceptsReservations' => true,
            'openingHoursSpecification' => self::openingHours(),
            'potentialAction' => [
                '@type' => 'OrderAction',
                'target' => [
                    '@type' => 'EntryPoint',
                    'urlTemplate' => url('/order/menu'),
                    'actionPlatform' => ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'],
                ],
                'deliveryMethod' => ['http://purl.org/goodrelations/v1#DeliveryModePickUp', 'http://purl.org/goodrelations/v1#DeliveryModeOwnFleet'],
            ],
        ], fn ($v) => $v !== null && $v !== []);
    }

    /**
     * One entry per open day from the Admin schedule.
     *
     * @param array<int, mixed>|null $hours rows keyed 0 (Sunday) to 6
     * @return list<array<string, string>>
     */
    public static function openingHours(?array $hours = null): array
    {
        try {
            $hours ??= app(OpeningHoursService::class)->getHoursForDisplay();
        } catch (\Throwable) {
            return [];
        }
        $out = [];
        foreach (self::DAYS as $i => $day) {
            $row = $hours[$i] ?? null;
            if (!is_array($row) || !empty($row['closed']) || empty($row['open']) || empty($row['close'])) {
                continue;
            }
            $out[] = [
                '@type' => 'OpeningHoursSpecification',
                'dayOfWeek' => 'https://schema.org/' . $day,
                'opens' => substr((string) $row['open'], 0, 5),
                'closes' => substr((string) $row['close'], 0, 5),
            ];
        }

        return $out;
    }

    /**
     * @param list<array{0: string, 1: string}> $trail [name, url] from the home page down
     * @return array<string, mixed>
     */
    public static function breadcrumbs(array $trail): array
    {
        return [
            '@context' => 'https://schema.org',
            '@type' => 'BreadcrumbList',
            'itemListElement' => array_map(fn (array $step, int $i) => [
                '@type' => 'ListItem',
                'position' => $i + 1,
                'name' => $step[0],
                'item' => $step[1],
            ], $trail, array_keys($trail)),
        ];
    }
}
