<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

/**
 * In-code registry of Home Component Library types.
 * Every type is available on Website and Order App unless deprecated.
 */
final class BlockTypeRegistry
{
    /** @var array<string, BlockTypeDefinition>|null */
    private static ?array $types = null;

    private const BOTH = ['website', 'order_app'];

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
    public static function forApp(string $app, bool $includeDeprecated = false): array
    {
        return array_values(array_filter(
            self::all(),
            function (BlockTypeDefinition $d) use ($app, $includeDeprecated) {
                if (! $d->allowsApp($app)) {
                    return false;
                }
                if ($d->deprecated && ! $includeDeprecated) {
                    return false;
                }

                return true;
            },
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
    public static function libraryTypes(): array
    {
        return array_values(array_map(
            fn (BlockTypeDefinition $d) => $d->type,
            array_filter(self::all(), fn (BlockTypeDefinition $d) => ! $d->deprecated),
        ));
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

    public static function flush(): void
    {
        self::$types = null;
    }

    /** @return array<string, BlockTypeDefinition> */
    private static function build(): array
    {
        $deviceSchema = BlockDeviceSettings::SCHEMA;
        $deviceDefaults = BlockDeviceSettings::DEFAULTS;

        $defs = [
            new BlockTypeDefinition(
                type: 'greeting',
                label: 'Greeting / welcome',
                description: 'Welcome line at the top of Home (“Hello …”).',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
            ),
            new BlockTypeDefinition(
                type: 'prayer_bar',
                label: 'Prayer Time Banner',
                description: 'Current/next prayer, countdown, Hijri/Gregorian date, island choice, and full timetable. Place in Home or header per device.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: BlockDeviceSettings::prayerDefaults('order_app'),
                dynamicSource: 'Prayer times service (island selection + calculation)',
            ),
            new BlockTypeDefinition(
                type: 'hero',
                label: 'Hero banner / promotional carousel',
                description: 'Photo/video slideshow at the top of Home. Uses Hero banners (hero_slides).',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'Content key hero_slides',
            ),
            // Deprecated: merged into hero. Existing rows migrate to hero.
            new BlockTypeDefinition(
                type: 'promo_carousel',
                label: 'Promo carousel (legacy)',
                description: 'Merged into Hero banner. Kept only so old drafts migrate cleanly.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                deprecated: true,
            ),
            new BlockTypeDefinition(
                type: 'announcement',
                label: 'Announcement banner',
                description: 'Short site-wide notice (info / warning / promo). Can sit in the header or on Home.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: BlockDeviceSettings::announcementDefaults(),
                dynamicSource: 'Content keys announcement_*',
            ),
            new BlockTypeDefinition(
                type: 'service_availability',
                label: 'Service availability / maintenance',
                description: 'Shows when online ordering, checkout, payment, or related services are paused.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'Service availability API',
            ),
            new BlockTypeDefinition(
                type: 'opening_status',
                label: 'Opening status',
                description: 'Open/closed badge for today’s ordering hours and tomorrow collection. Follows its own placement — never forced inside Hero.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'Online ordering status / hours gate',
            ),
            new BlockTypeDefinition(
                type: 'stat_chips',
                label: 'Stat chips / loyalty summary',
                description: 'Quick chips such as loyalty points. Only appears when this component is in the layout.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'Loyalty account API',
            ),
            new BlockTypeDefinition(
                type: 'mode_cards',
                label: 'Order mode cards',
                description: 'Delivery, Pickup, and Dine-in entry cards.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                flowWarning: 'Without order mode cards, customers need another path into ordering. A safe empty fallback still keeps the page from going blank.',
            ),
            new BlockTypeDefinition(
                type: 'specials',
                label: 'Specials / offers carousel',
                description: 'Today’s specials and offers as a swipeable row.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'Offers / daily specials API',
            ),
            new BlockTypeDefinition(
                type: 'featured',
                label: 'Featured items',
                description: 'Highlighted menu items on Home.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'Menu items (featured)',
            ),
            new BlockTypeDefinition(
                type: 'categories',
                label: 'Categories',
                description: 'Shortcut tiles into menu categories.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'homepage_categories content + menu',
            ),
            new BlockTypeDefinition(
                type: 'trust_strip',
                label: 'Trust strip',
                description: 'Four trust signals (fresh, halal, delivery, …). Only shows where you place it — never auto-injected.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'Content key trust_items',
            ),
            new BlockTypeDefinition(
                type: 'proof',
                label: 'Social proof',
                description: 'Stats and trust numbers on Home.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
            ),
            new BlockTypeDefinition(
                type: 'reviews',
                label: 'Customer reviews',
                description: 'Recent star ratings and comments.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'Featured reviews API',
            ),
            new BlockTypeDefinition(
                type: 'reorder_strip',
                label: 'Reorder strip',
                description: 'Lets returning customers reorder a recent meal in one tap.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'Customer orders API',
            ),
            new BlockTypeDefinition(
                type: 'cta',
                label: 'Call-to-action band',
                description: 'The “Hungry?” style banner that sends people to order.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
            ),
            new BlockTypeDefinition(
                type: 'location',
                label: 'Location / map',
                description: 'Address, map link, and how to find us.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
            ),
            new BlockTypeDefinition(
                type: 'events_band',
                label: 'Catering / events band',
                description: 'Events & catering call-to-action band.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'Content keys events_section_*',
            ),
            new BlockTypeDefinition(
                type: 'office_orders',
                label: 'Office orders card',
                description: 'Corporate / office catering card.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                dynamicSource: 'Content keys office_orders_*',
            ),
            new BlockTypeDefinition(
                type: 'brand_footer',
                label: 'Brand footer / Home footer',
                description: 'Compact Home footer with contact chat links and thanks line. Prefer the Footer surface for full footers.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: $deviceSchema,
                settingsDefaults: $deviceDefaults,
                flowWarning: 'Removing the brand footer hides contact shortcuts on Home. The full Footer surface is separate.',
            ),
            new BlockTypeDefinition(
                type: 'site_footer',
                label: 'Full footer',
                description: 'Full branding/contact/legal footer. Not the same as Bottom Navigation.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: array_merge($deviceSchema, [
                    'layout' => 'nullable|in:full,compact,stacked',
                ]),
                settingsDefaults: array_merge($deviceDefaults, [
                    'placement_desktop' => 'footer',
                    'placement_mobile' => 'footer',
                    'layout' => 'full',
                ]),
                dynamicSource: 'Footer content keys + real opening-hours service for hours text',
            ),
            new BlockTypeDefinition(
                type: 'bottom_nav',
                label: 'Bottom navigation',
                description: 'Mobile tab bar (Home, Menu, Orders, …). Separate from Footer.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: array_merge($deviceSchema, [
                    'tabs' => 'nullable|array|max:8',
                    'tabs.*.id' => 'required|string|max:40',
                    'tabs.*.label' => 'nullable|string|max:40',
                    'tabs.*.href' => 'nullable|string|max:200',
                    'tabs.*.visible' => 'nullable|boolean',
                ]),
                settingsDefaults: array_merge($deviceDefaults, [
                    'show_desktop' => false,
                    'show_mobile' => true,
                    'placement_desktop' => 'bottom_navigation',
                    'placement_mobile' => 'bottom_navigation',
                ]),
            ),
            new BlockTypeDefinition(
                type: 'rich_text',
                label: 'Custom text',
                description: 'A heading and a paragraph or two — for announcements, stories, or notes.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: array_merge($deviceSchema, [
                    'heading' => 'nullable|string|max:200',
                    'body' => 'nullable|string|max:10000',
                ]),
                settingsDefaults: $deviceDefaults,
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'image',
                label: 'Custom image',
                description: 'One picture from the media library, with an optional caption.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: array_merge($deviceSchema, [
                    'media_id' => 'nullable|integer|exists:media_assets,id',
                    'caption' => 'nullable|string|max:500',
                    'alt' => 'nullable|string|max:200',
                ]),
                settingsDefaults: $deviceDefaults,
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'image_text',
                label: 'Image with text',
                description: 'A picture beside a heading and paragraph — choose which side the picture sits on.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: array_merge($deviceSchema, [
                    'media_id' => 'nullable|integer|exists:media_assets,id',
                    'caption' => 'nullable|string|max:500',
                    'alt' => 'nullable|string|max:200',
                    'heading' => 'nullable|string|max:200',
                    'body' => 'nullable|string|max:10000',
                    'side' => 'required|in:left,right',
                ]),
                settingsDefaults: array_merge($deviceDefaults, ['side' => 'left']),
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'video',
                label: 'Video',
                description: 'A silent looping video from the media library, with an optional caption.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: array_merge($deviceSchema, [
                    'media_id' => 'nullable|integer|exists:media_assets,id',
                    'caption' => 'nullable|string|max:500',
                ]),
                settingsDefaults: $deviceDefaults,
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'button_band',
                label: 'Button band',
                description: 'A short line of text with up to two buttons.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: array_merge($deviceSchema, [
                    'text' => 'nullable|string|max:300',
                    'button1_label' => 'nullable|string|max:80',
                    'button1_url' => 'nullable|string|max:500',
                    'button2_label' => 'nullable|string|max:80',
                    'button2_url' => 'nullable|string|max:500',
                ]),
                settingsDefaults: $deviceDefaults,
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'faq_list',
                label: 'FAQ',
                description: 'Questions and answers — delivery areas, allergens, and the like.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: array_merge($deviceSchema, [
                    'items' => 'nullable|array|max:40',
                    'items.*.question' => 'required|string|max:300',
                    'items.*.answer' => 'required|string|max:2000',
                ]),
                settingsDefaults: $deviceDefaults,
                allowsMultiple: true,
            ),
            new BlockTypeDefinition(
                type: 'divider',
                label: 'Divider / spacing',
                description: 'Breathing room between sections — blank space or a thin line.',
                apps: self::BOTH,
                removable: true,
                supportsSharedContent: false,
                settingsSchema: array_merge($deviceSchema, [
                    'style' => 'required|in:spacer,rule',
                    'size' => 'required|in:sm,md,lg',
                ]),
                settingsDefaults: array_merge($deviceDefaults, ['style' => 'spacer', 'size' => 'md']),
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
