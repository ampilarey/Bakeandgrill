<?php

declare(strict_types=1);

namespace App\Domains\Marketing\Support;

/**
 * Decides whether two menu items are really the same thing in two sizes.
 *
 * Suggesting "Burger (big)" to someone who just added "Burger small" is the
 * suggestion that makes the whole feature look broken — it is not an upsell,
 * it is the till arguing with the customer about what they just ordered.
 *
 * The menu has several of these pairs already: Burger small / Burger (big),
 * Club sandwich S / Club sandwich full, and G boakibaa / G.boakibaa, which
 * appear to be the same product entered twice.
 *
 * Deliberately NOT category-based. An earlier plan was to suppress pairings
 * inside a category, and against this menu that would have been actively
 * harmful: Shorteats is 13 items and shorteats-with-shorteats is the normal
 * basket here — nobody buys one gulha. Category says nothing about whether two
 * items are substitutes; the name does.
 */
final class ItemNameSimilarity
{
    /**
     * Size and portion words, stripped when they stand alone.
     *
     * Only whole tokens: "small" goes, but "Smallhouse Special" keeps its name.
     *
     * @var list<string>
     */
    private const SIZE_TOKENS = [
        'small', 'sml', 's',
        'medium', 'med', 'm',
        'large', 'lrg', 'lg', 'l',
        'big', 'xl', 'xxl',
        'full', 'half',
        'regular', 'reg',
        'mini', 'jumbo',
        'single', 'double',
        'pc', 'pcs', 'piece', 'pieces',
    ];

    /** Two items that differ only by size, spacing, or punctuation. */
    public static function areNearDuplicates(string $a, string $b): bool
    {
        $left = self::baseName($a);
        $right = self::baseName($b);

        // A name that is nothing but a size word normalises to empty; treating
        // those as matching would silently pair unrelated items.
        if ($left === '' || $right === '') {
            return false;
        }

        return $left === $right;
    }

    /**
     * The identity of an item with size and punctuation removed.
     *
     * "Burger small", "Burger (big)" and "burger" all reduce to "burger".
     * "F.gulha" and "H.gulha" do NOT collide — they reduce to "f gulha" and
     * "h gulha", which is right: those are different fillings and people buy
     * them together.
     */
    public static function baseName(string $name): string
    {
        // Punctuation becomes a space rather than vanishing, so "G.boakibaa"
        // and "G boakibaa" meet in the middle. Removing it outright would give
        // "gboakibaa" and "g boakibaa", which would not match.
        $normalized = strtolower(trim($name));
        $normalized = preg_replace('/[^a-z0-9]+/', ' ', $normalized) ?? '';
        $normalized = trim(preg_replace('/\s+/', ' ', $normalized) ?? '');

        if ($normalized === '') {
            return '';
        }

        $kept = array_filter(
            explode(' ', $normalized),
            static fn (string $token) => $token !== '' && !in_array($token, self::SIZE_TOKENS, true),
        );

        return implode(' ', $kept);
    }

    /**
     * Filter candidate ids down to those that are not a size-twin of anything
     * already chosen.
     *
     * @param  array<int, string>  $candidates  id => name
     * @param  list<string>  $against  names already in the basket or ticket
     * @return list<int> the ids worth suggesting
     */
    public static function rejectNearDuplicates(array $candidates, array $against): array
    {
        $anchorBases = [];
        foreach ($against as $name) {
            $base = self::baseName($name);
            if ($base !== '') {
                $anchorBases[$base] = true;
            }
        }

        if ($anchorBases === []) {
            return array_map('intval', array_keys($candidates));
        }

        $keep = [];
        foreach ($candidates as $id => $name) {
            $base = self::baseName($name);
            if ($base !== '' && isset($anchorBases[$base])) {
                continue;
            }
            $keep[] = (int) $id;
        }

        return $keep;
    }
}
