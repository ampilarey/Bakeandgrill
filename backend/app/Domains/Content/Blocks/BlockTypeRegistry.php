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

    public static function allowsMultiple(string $type): bool
    {
        return self::get($type)?->allowsMultiple ?? false;
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

            // ── Generic content blocks ───────────────────────────────────────
            // Free-form blocks the owner can add as many times as they like.
            // They live on both home pages because the same words, picture, or
            // button are just as useful above the order flow as on the
            // marketing site — except the FAQ list, which answers website
            // visitor questions (delivery areas, allergens) and would only get
            // in the way of someone mid-order. The divider is the one type with
            // no shareable content: it carries spacing, not words, so there is
            // nothing for two apps to share.
            new BlockTypeDefinition(
                type: 'rich_text',
                label: 'Text block',
                description: 'A heading and a paragraph or two — for announcements, stories, or notes.',
                apps: ['website', 'order_app'],
                removable: true,
                supportsSharedContent: true,
                settingsSchema: [
                    'heading' => 'nullable|string|max:200',
                    'body' => 'nullable|string|max:10000',
                ],
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'image',
                label: 'Image',
                description: 'One picture from the media library, with an optional caption.',
                apps: ['website', 'order_app'],
                removable: true,
                supportsSharedContent: true,
                settingsSchema: [
                    'media_id' => 'nullable|integer|exists:media_assets,id',
                    'caption' => 'nullable|string|max:500',
                    'alt' => 'nullable|string|max:200',
                ],
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'image_text',
                label: 'Image with text',
                description: 'A picture beside a heading and paragraph — choose which side the picture sits on.',
                apps: ['website', 'order_app'],
                removable: true,
                supportsSharedContent: true,
                settingsSchema: [
                    'media_id' => 'nullable|integer|exists:media_assets,id',
                    'caption' => 'nullable|string|max:500',
                    'alt' => 'nullable|string|max:200',
                    'heading' => 'nullable|string|max:200',
                    'body' => 'nullable|string|max:10000',
                    'side' => 'required|in:left,right',
                ],
                settingsDefaults: ['side' => 'left'],
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'button_band',
                label: 'Button band',
                description: 'A short line of text with up to two buttons.',
                apps: ['website', 'order_app'],
                removable: true,
                supportsSharedContent: true,
                settingsSchema: [
                    'text' => 'nullable|string|max:300',
                    'button1_label' => 'nullable|string|max:80',
                    'button1_url' => 'nullable|string|max:500',
                    'button2_label' => 'nullable|string|max:80',
                    'button2_url' => 'nullable|string|max:500',
                ],
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'divider',
                label: 'Divider',
                description: 'Breathing room between sections — blank space or a thin line.',
                apps: ['website', 'order_app'],
                removable: true,
                supportsSharedContent: false,
                settingsSchema: [
                    'style' => 'required|in:spacer,rule',
                    'size' => 'required|in:sm,md,lg',
                ],
                settingsDefaults: ['style' => 'spacer', 'size' => 'md'],
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'video',
                label: 'Video',
                description: 'A silent looping video from the media library, with an optional caption.',
                apps: ['website', 'order_app'],
                removable: true,
                supportsSharedContent: true,
                settingsSchema: [
                    'media_id' => 'nullable|integer|exists:media_assets,id',
                    'caption' => 'nullable|string|max:500',
                ],
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'faq_list',
                label: 'FAQ list',
                description: 'Questions and answers for website visitors — delivery areas, allergens, and the like.',
                apps: ['website'],
                removable: true,
                supportsSharedContent: false,
                settingsSchema: [
                    'items' => 'nullable|array|max:40',
                    'items.*.question' => 'required|string|max:300',
                    'items.*.answer' => 'required|string|max:2000',
                ],
                allowsMultiple: true,
            ),
        ];

        $map = [];
        foreach ($defs as $def) {
            $map[$def->type] = $def;
        }

        return $map;
    }
}
