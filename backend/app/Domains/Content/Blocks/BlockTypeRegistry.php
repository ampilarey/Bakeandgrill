<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

/**
 * In-code registry of home page block types.
 * Plain-language labels for a non-technical owner.
 */
final class BlockTypeRegistry
{
    /** @var array<string, BlockTypeDefinition>|null */
    private static ?array $types = null;

    /** @return array<string, BlockTypeDefinition> */
    public static function all(): array
    {
        return self::$types ??= self::build();
    }

    public static function get(string $type): ?BlockTypeDefinition
    {
        return self::all()[$type] ?? null;
    }

    /** @return list<BlockTypeDefinition> */
    public static function forApp(string $app): array
    {
        return array_values(array_filter(
            self::all(),
            fn (BlockTypeDefinition $d) => $d->allowsApp($app),
        ));
    }

    public static function isKnown(string $type): bool
    {
        return isset(self::all()[$type]);
    }

    public static function isRemovable(string $type): bool
    {
        $def = self::get($type);

        return $def?->removable ?? true;
    }

    /** @return list<string> */
    public static function unknownTypesAmong(iterable $types): array
    {
        $unknown = [];
        foreach ($types as $type) {
            if (! is_string($type) || self::isKnown($type)) {
                continue;
            }
            $unknown[] = $type;
        }

        return array_values(array_unique($unknown));
    }

    /** Reset for tests. */
    public static function flush(): void
    {
        self::$types = null;
    }

    /** @return array<string, BlockTypeDefinition> */
    private static function build(): array
    {
        $defs = [
            new BlockTypeDefinition(
                type: 'hero',
                label: 'Hero banner',
                description: 'The big photo/video slideshow at the top of the home page.',
                apps: ['website', 'order_app'],
                removable: true,
                supportsSharedContent: true,
            ),
            new BlockTypeDefinition(
                type: 'specials',
                label: 'Specials carousel',
                description: 'Today’s specials and offers, shown as a swipeable row.',
                apps: ['website', 'order_app'],
                removable: true,
                supportsSharedContent: true,
            ),
            new BlockTypeDefinition(
                type: 'featured',
                label: 'Featured items',
                description: 'Highlighted menu items on the website home page.',
                apps: ['website'],
                removable: true,
                supportsSharedContent: false,
            ),
            new BlockTypeDefinition(
                type: 'categories',
                label: 'Categories',
                description: 'Shortcut tiles into menu categories.',
                apps: ['website', 'order_app'],
                removable: true,
                supportsSharedContent: true,
            ),
            new BlockTypeDefinition(
                type: 'proof',
                label: 'Social proof',
                description: 'Stats and trust signals on the website home page.',
                apps: ['website'],
                removable: true,
                supportsSharedContent: false,
            ),
            new BlockTypeDefinition(
                type: 'cta',
                label: 'Call-to-action band',
                description: 'The “Hungry?” style banner that sends people to order.',
                apps: ['website'],
                removable: true,
                supportsSharedContent: false,
            ),
            new BlockTypeDefinition(
                type: 'location',
                label: 'Location',
                description: 'Address, map link, and how to find us.',
                apps: ['website'],
                removable: true,
                supportsSharedContent: false,
            ),
            new BlockTypeDefinition(
                type: 'reviews',
                label: 'Customer reviews',
                description: 'Recent star ratings and comments on the order app home.',
                apps: ['order_app'],
                removable: true,
                supportsSharedContent: false,
            ),
            new BlockTypeDefinition(
                type: 'mode_cards',
                label: 'Order mode cards',
                description: 'Delivery, Pickup, and Dine-in — the only way customers start an order.',
                apps: ['order_app'],
                removable: false,
                supportsSharedContent: false,
                nonRemovableReason: 'These cards are the only way into ordering. Removing them would remove checkout.',
            ),
            new BlockTypeDefinition(
                type: 'reorder_strip',
                label: 'Reorder strip',
                description: 'Lets returning customers reorder a recent meal in one tap.',
                apps: ['order_app'],
                removable: true,
                supportsSharedContent: false,
            ),
            new BlockTypeDefinition(
                type: 'promo_carousel',
                label: 'Promo carousel',
                description: 'Promotional slides on the order app (same family as the hero banner).',
                apps: ['order_app'],
                removable: true,
                supportsSharedContent: true,
            ),
            new BlockTypeDefinition(
                type: 'greeting',
                label: 'Greeting',
                description: '“Hello …” welcome line at the top of the phone home screen.',
                apps: ['order_app'],
                removable: true,
                supportsSharedContent: false,
            ),
            new BlockTypeDefinition(
                type: 'prayer_bar',
                label: 'Prayer times bar',
                description: 'Shows the next prayer time on the phone home screen.',
                apps: ['order_app'],
                removable: true,
                supportsSharedContent: false,
            ),
            new BlockTypeDefinition(
                type: 'opening_status',
                label: 'Opening status',
                description: 'Open/closed badge showing whether ordering is available right now.',
                apps: ['order_app'],
                removable: true,
                supportsSharedContent: false,
            ),
            new BlockTypeDefinition(
                type: 'brand_footer',
                label: 'Brand footer',
                description: 'Logo, contact links, and legal/contact wording at the bottom of the page.',
                apps: ['website', 'order_app'],
                removable: false,
                supportsSharedContent: true,
                nonRemovableReason: 'The footer carries contact and legal information and must stay on the page.',
            ),
        ];

        $map = [];
        foreach ($defs as $def) {
            $map[$def->type] = $def;
        }

        return $map;
    }
}
