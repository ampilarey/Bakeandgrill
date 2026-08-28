<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Stable public landing path for a row from OffersService / specials display.
 * Anchors like /menu#offers cannot carry their own OG tags.
 */
final class PublicOfferUrl
{
    /**
     * @param array<string, mixed> $offer
     */
    public static function fromFeedRow(array $offer): string
    {
        $kind = (string) ($offer['kind'] ?? '');
        if ($kind === 'special') {
            $id = (int) ($offer['special_id'] ?? 0);
            if ($id < 1) {
                $id = self::idFromPrefixed((string) ($offer['id'] ?? ''), 'special-');
            }

            return $id > 0 ? '/offers/special/' . $id : '/menu';
        }
        if ($kind === 'promo') {
            $id = (int) ($offer['promotion_id'] ?? 0);

            return $id > 0 ? '/offers/promo/' . $id : '/menu';
        }

        $legacyId = (int) ($offer['id'] ?? 0);
        if ($legacyId > 0 && $kind === '') {
            return '/offers/special/' . $legacyId;
        }

        return '/menu';
    }

    private static function idFromPrefixed(string $raw, string $prefix): int
    {
        if (!str_starts_with($raw, $prefix)) {
            return 0;
        }

        return (int) explode('-', substr($raw, strlen($prefix)))[0];
    }
}
