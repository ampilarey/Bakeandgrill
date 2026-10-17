<?php

declare(strict_types=1);

namespace App\Domains\Posters;

/**
 * Every purpose in docs/POSTER_PLAN.md § 4.3: a preset on one of the eight
 * layouts, with default words in both languages and the thing it binds to.
 * "Tell us how we did" is a qr card on this engine. The public complaint
 * sheet pages stay so bookmarks and the many-up print links keep working.
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
            'bogo' => self::row('Buy one get one', 'Offers', 'price_card', 'item', [
                'headline' => 'Buy one, get one', 'headline_dv' => 'އެއްގެ ގޮތުގައި ދެއްވާ',
                'badge' => 'Two for one', 'price' => '',
            ]),
            'two_for' => self::row('2 for a price', 'Offers', 'price_card', 'item', [
                'headline' => '2 for', 'headline_dv' => 'ދޭށް އެއްކޮށް',
                'badge' => 'Pair', 'price' => '',
            ]),
            'weekend' => self::row('Weekend special', 'Offers', 'price_card', 'promotion', [
                'headline' => 'Weekend special', 'headline_dv' => 'ވީކެންޑް ސްޕެޝަލް',
                'badge' => 'Fri–Sun', 'price' => '',
            ]),
            'student' => self::row('Student or staff offer', 'Offers', 'price_card', 'none', [
                'headline' => 'Student and staff', 'headline_dv' => 'ދަރިވަރުންނާއި ސްޓާފް',
                'badge' => 'Show your card', 'price' => '', 'subhead' => 'Ask at the counter',
            ]),
            'loyalty' => self::row('Loyalty points', 'Offers', 'notice', 'none', [
                'headline' => 'Your points', 'headline_dv' => 'ތިޔަ ޕޮއިންޓް',
                'body' => 'Ask to add this visit to your account.',
                'body_dv' => 'މި ޒިޔާރަތް އެކައުންޓަށް ލައްވާ',
            ]),
            'gift_cards' => self::row('Gift cards', 'Offers', 'notice', 'none', [
                'headline' => 'Gift cards', 'headline_dv' => 'ގިފްޓް ކާޑު',
                'body' => 'A card for someone else, from the counter.',
                'body_dv' => 'ކައުންޓަރުން ދޭ ކާޑެއް',
            ]),
            'bring_a_friend' => self::row('Bring a friend', 'Offers', 'price_card', 'promotion', [
                'headline' => 'Bring a friend', 'headline_dv' => 'ރައްޔިތެއް ގެންނަވާ',
                'badge' => 'Two guests', 'price' => '',
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
            'chefs_pick' => self::row("Chef's pick", 'Dishes', 'hero_photo', 'item', [
                'eyebrow' => "Chef's pick", 'headline' => '', 'headline_dv' => '',
            ]),
            'spicy' => self::row('Spicy challenge', 'Dishes', 'hero_photo', 'item', [
                'eyebrow' => 'Hot', 'headline' => 'Spicy challenge', 'headline_dv' => 'ތަރިކަރި ޗެލެންޖް',
            ]),
            'menu_board' => self::row('Menu board', 'Dishes', 'list', 'category', [
                'headline' => 'Menu', 'headline_dv' => 'މެނޫ',
            ], true),
            'drinks' => self::row('Drinks and juices', 'Dishes', 'list', 'category', [
                'headline' => 'Drinks', 'headline_dv' => 'ބުއިން',
            ]),
            'allergens' => self::row('Allergen guide', 'Dishes', 'notice', 'none', [
                'headline' => 'Allergens', 'headline_dv' => 'އެލަރޖީ',
                'body' => 'Ask us about nuts, dairy, gluten and shellfish.',
                'body_dv' => 'ގޮނޑި، ކިރު، ގްލޫޓަން، ކަކުނި އަދި ސަލަދޫ ސުވާލު ކުރޭ',
            ]),
            'dietary' => self::row('Halal and dietary marks', 'Dishes', 'notice', 'none', [
                'headline' => 'Halal', 'headline_dv' => 'ޙަލާލް',
                'body' => 'Everything we cook is halal. Ask about vegetarian dishes.',
                'body_dv' => 'އަޅުގަނޑުމެން ކައްކާ ހުރިހާ އެއްޗެއް ޙަލާލް. ސަބްޒީ ކާން ސުވާލު ކުރޭ',
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
            'iftar' => self::row('Iftar menu', 'Times', 'list', 'category', [
                'headline' => 'Iftar', 'headline_dv' => 'އިފްތާރު',
            ]),
            'eid' => self::row('Eid', 'Times', 'notice', 'none', [
                'headline' => 'Eid Mubarak', 'headline_dv' => 'ޢީދު މުބާރަކް',
                'body' => 'We are open. See the hours.',
                'body_dv' => 'ހުޅުވިފައި. ވަގުތު ބަލާށެވެ',
            ]),
            'national_day' => self::row('National day', 'Times', 'notice', 'none', [
                'headline' => 'National day', 'headline_dv' => 'ޤައުމީ ދުވަސް',
                'body' => 'Open today. Ask what is on.',
                'body_dv' => 'މިއަދު ހުޅުވިފައި',
            ]),
            'event_night' => self::row('Event night', 'Times', 'notice', 'none', [
                'headline' => 'Tonight', 'headline_dv' => 'މިރޭ',
                'body' => 'A night at the cafe. Ask for a seat.',
                'body_dv' => 'ކެފޭގައި ރޭގަނޑެއް. ޖާގަ ސުވާލު ކުރޭ',
            ]),
            'anniversary' => self::row('Opening or anniversary', 'Times', 'notice', 'none', [
                'headline' => 'Our anniversary', 'headline_dv' => 'އަހަރީ ދުވަސް',
                'body' => 'Thank you for eating with us.',
                'body_dv' => 'އަޅުގަނޑުމެންނާއެކު ކެއުމަށް ޝުކުރިއްޔާ',
            ]),
            'we_cater' => self::row('We cater', 'Times', 'notice', 'none', [
                'headline' => 'We cater', 'headline_dv' => 'ކެޓްރިން ކުރޭ',
                'body' => 'Tell us the date and how many people.',
                'body_dv' => 'ތާރީޚާއި މީހުންގެ އަދަދު ބުނެދީ',
            ]),
            'order_ahead' => self::row('Order ahead', 'Times', 'qr_card', 'none', [
                'headline' => 'Order ahead', 'headline_dv' => 'ކުރިން އޯޑަރު ކުރޭ',
                'subhead' => 'Scan and we start it',
            ], true),
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
            'ways_to_pay' => self::row('Ways to pay', 'Ordering', 'notice', 'none', [
                'headline' => 'Ways to pay', 'headline_dv' => 'ފައިސާ ދެއްވުން',
                'body' => 'Cash, card and transfer.',
                'body_dv' => 'ކެޝް، ކާޑު، ޓްރާންސްފަރ',
            ]),
            'wifi' => self::row('Wi-Fi card', 'Ordering', 'qr_card', 'none', [
                'headline' => 'Wi-Fi', 'headline_dv' => 'ވައިފައި',
                'subhead' => 'Scan to join', 'ssid' => '', 'password' => '',
            ], true),
            'follow' => self::row('Follow us', 'Ordering', 'qr_card', 'none', [
                'headline' => 'Follow us', 'headline_dv' => 'ފޮލޯ ކުރޭ',
                'subhead' => 'Scan for our page', 'url' => '',
            ], true),
            'hiring' => self::row("We're hiring", 'Inside', 'notice', 'none', [
                'headline' => "We're hiring", 'headline_dv' => 'މަސައްކަތް ހޯދުން',
                'body' => 'Ask at the counter or send a message.',
                'body_dv' => 'ކައުންޓަރުން ސުވާލު ކުރޭ ނުވަތަ މެސެޖެއް ފޮނުވާ',
            ]),
            'wash_hands' => self::row('Wash your hands', 'Inside', 'notice', 'none', [
                'headline' => 'Wash your hands', 'headline_dv' => 'އަތް ދޮވާ',
                'body' => 'Soap, then water, before you start.',
                'body_dv' => 'ފަށާން ކުރިން ސޯޕާއި ފެން',
            ]),
            'staff_only' => self::row('Staff only', 'Inside', 'notice', 'none', [
                'headline' => 'Staff only', 'headline_dv' => 'ސްޓާފް އެކަނި',
                'body' => 'This door is for the team.',
                'body_dv' => 'މި ދޮރު ޓީމަށް',
            ]),
            'storage' => self::row('Storage temperatures', 'Inside', 'notice', 'none', [
                'headline' => 'Storage', 'headline_dv' => 'ރައްކާ',
                'body' => 'Fridge at 5°C or below. Freezer at −18°C.',
                'body_dv' => 'ފްރިޖް 5°C ނުވަތަ ދަށުން. ފްރީޒަރ −18°C',
            ]),
            'plain_notice' => self::row('Plain notice', 'Inside', 'notice', 'none', [
                'headline' => 'Notice', 'headline_dv' => 'ނޯޓިސް', 'body' => '',
            ]),
            'how_we_did' => self::row('Tell us how we did', 'Ordering', 'qr_card', 'none', [
                'headline' => 'Tell us how we did', 'headline_dv' => 'ކަންކަން ކިހިނެއްތޯ ބުނެދީ',
                'subhead' => 'Scan and leave a note',
            ], true),
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
