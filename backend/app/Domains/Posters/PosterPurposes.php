<?php

declare(strict_types=1);

namespace App\Domains\Posters;

/**
 * The Phase 1 purposes (docs/POSTER_PLAN.md § 4.3 and § 13): each one is a
 * preset on one of the eight layouts, with default words in both languages
 * and the thing it binds to. "Tell us how we did" opens the complaint
 * poster that already exists; Posters takes that design over in Phase 2.
 */
final class PosterPurposes
{
    /**
     * @return array<string, array{
     *   label: string, group: string, layout: string, bind: string,
     *   landscape: bool, external?: string, slots: array<string, string>
     * }>
     */
    public static function all(): array
    {
        return [
            'happy_hour' => self::row('Happy hour', 'Offers', 'price_card', 'promotion', [
                'headline' => 'Happy hour', 'headline_dv' => 'ހެޕީ އަވަރު',
                'badge' => 'Today', 'price' => '', 'period' => '',
            ]),
            'dish_discount' => self::row('Dish on discount', 'Offers', 'compare', 'item', [
                'headline' => 'On discount', 'headline_dv' => 'ޑިސްކައުންޓް',
                'badge' => 'Offer',
            ]),
            'price_drop' => self::row('New lower price', 'Offers', 'compare', 'item', [
                'headline' => 'New lower price', 'headline_dv' => 'އައު އަގު',
                'badge' => 'Now',
            ]),
            'meal_deal' => self::row('Meal deal', 'Offers', 'compare', 'none', [
                'headline' => 'Meal deal', 'headline_dv' => 'މީލް ޑީލް',
                'badge' => 'Deal', 'price' => '', 'subhead' => 'Ask at the counter',
            ]),
            'percent_off' => self::row('Percent off everything', 'Offers', 'price_card', 'promotion', [
                'headline' => 'Off everything', 'headline_dv' => 'ހުރިހާ އެއްޗެއްގައި',
                'badge' => 'All menu', 'price' => '',
            ]),
            'coupon' => self::row('Flier with a coupon', 'Offers', 'price_card', 'promotion', [
                'headline' => 'A code for you', 'headline_dv' => 'ތިޔަބޭފުޅާ ކޯޑެއް',
                'badge' => 'Coupon', 'price' => '', 'subhead' => 'Say the code when you order',
            ]),
            'new_dish' => self::row('New dish', 'Dishes', 'hero_photo', 'item', [
                'eyebrow' => 'New on the menu', 'headline' => '', 'headline_dv' => '',
            ]),
            'dish_of_the_day' => self::row('Dish of the day', 'Dishes', 'hero_photo', 'item', [
                'eyebrow' => 'Today', 'headline' => 'Dish of the day', 'headline_dv' => 'މިއަދުގެ ކާން',
            ]),
            'best_sellers' => self::row('Best sellers', 'Dishes', 'list', 'none', [
                'headline' => 'Best sellers', 'headline_dv' => 'އެންމެ ގިނައިން ވިއްކާ',
            ]),
            'category' => self::row('A category', 'Dishes', 'list', 'category', [
                'headline' => '', 'headline_dv' => '',
            ]),
            'mini_menu' => self::row('Mini menu', 'Dishes', 'list', 'category', [
                'headline' => 'Mini menu', 'headline_dv' => 'މިނި މެނޫ',
            ]),
            'opening_hours' => self::row('Opening hours', 'Times', 'hours_grid', 'none', [
                'headline' => 'Opening hours', 'headline_dv' => 'ހުޅުވާ ވަގުތު',
            ]),
            'holiday_hours' => self::row('Holiday hours', 'Times', 'hours_grid', 'none', [
                'headline' => 'Holiday hours', 'headline_dv' => 'ހޮލިޑޭ ވަގުތު',
                'body' => '',
            ]),
            'ramadan' => self::row('Ramadan hours', 'Times', 'hours_grid', 'none', [
                'headline' => 'Ramadan hours', 'headline_dv' => 'ރަމަޟާން ވަގުތު',
                'body' => 'Iftar and suhoor follow these hours.',
            ]),
            'scan_to_order' => self::row('Scan to order', 'Ordering', 'qr_card', 'none', [
                'headline' => 'Scan to order', 'headline_dv' => 'ސްކޭން ކޮށް އޯޑަރު ކުރޭ',
                'subhead' => 'Point your camera at the code',
            ], true),
            'table_card' => self::row('Table card', 'Ordering', 'qr_card', 'table', [
                'headline' => 'Order from your table', 'headline_dv' => 'މޭޒުން އޯޑަރު ކުރޭ',
                'subhead' => 'One code for this table',
            ], true),
            'we_deliver' => self::row('We deliver', 'Ordering', 'notice', 'none', [
                'headline' => 'We deliver', 'headline_dv' => 'ޑެލިވަރީ ކުރޭ',
                'body' => 'Order on the phone or from the menu.',
                'body_dv' => 'ފޯނުން ނުވަތަ މެނޫގައިން އޯޑަރު ކުރޭ',
            ]),
            'hiring' => self::row("We're hiring", 'Inside', 'notice', 'none', [
                'headline' => "We're hiring", 'headline_dv' => 'މަސައްކަތް ހޯދުން',
                'body' => 'Ask at the counter or send a message.',
            ]),
            'plain_notice' => self::row('Plain notice', 'Inside', 'notice', 'none', [
                'headline' => 'Notice', 'headline_dv' => 'ނޯޓިސް', 'body' => '',
            ]),
            'how_we_did' => self::row('Tell us how we did', 'Ordering', 'qr_card', 'none', [], false, '/complain/poster'),
        ];
    }

    public static function get(string $key): ?array
    {
        return self::all()[$key] ?? null;
    }

    /** @return list<string> */
    public static function layouts(): array
    {
        return ['hero_photo', 'price_card', 'list', 'hours_grid', 'qr_card', 'notice', 'compare', 'collage'];
    }

    /**
     * @param array<string, string> $slots
     * @return array{label: string, group: string, layout: string, bind: string, landscape: bool, external: ?string, slots: array<string, string>}
     */
    private static function row(string $label, string $group, string $layout, string $bind, array $slots, bool $landscape = false, ?string $external = null): array
    {
        return [
            'label' => $label,
            'group' => $group,
            'layout' => $layout,
            'bind' => $bind,
            'landscape' => $landscape,
            'external' => $external,
            'slots' => $slots,
        ];
    }
}
