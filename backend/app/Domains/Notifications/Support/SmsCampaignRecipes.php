<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

/**
 * Ready-made campaigns (SMS audit, 2026-09-24): an audience and a text the
 * owner can start from instead of a blank form. A recipe that `needs` an
 * item or category is filled in by the picker before it can be previewed.
 * `{name}` becomes the customer's first name when the text goes out.
 */
final class SmsCampaignRecipes
{
    /** @return list<array{key: string, label: string, description: string, needs: ?string, criteria: array<string, mixed>, message: string}> */
    public static function all(): array
    {
        return [
            [
                'key' => 'we_miss_you',
                'label' => 'We miss you',
                'description' => 'Customers who have not ordered for a month.',
                'needs' => null,
                'criteria' => ['dormant_days' => 30],
                'message' => "Hi {name}, it's been a while! Come back to Bake & Grill this week and show this text for a free drink with any meal.",
            ],
            [
                'key' => 'win_back',
                'label' => 'Win-back offer',
                'description' => 'Customers who have not ordered for two months, with a stronger offer.',
                'needs' => null,
                'criteria' => ['dormant_days' => 60],
                'message' => 'Hi {name}, we saved you a seat. 20% off your next order at Bake & Grill until Sunday. Show this text at the counter or order online.',
            ],
            [
                'key' => 'new_dish_for_fans',
                'label' => 'New dish for fans of…',
                'description' => 'People who bought a dish, or what usually goes with it, in the last 90 days.',
                'needs' => 'item',
                'criteria' => ['likes_item_id' => null, 'window_days' => 90],
                'message' => 'Hi {name}, you liked it last time, so you get to hear first: there is a new dish on the Bake & Grill menu this week. Come and try it.',
            ],
            [
                'key' => 'category_regulars',
                'label' => 'Regulars of a category',
                'description' => 'Anyone who bought from a menu category in the last 60 days.',
                'needs' => 'category',
                'criteria' => ['bought_category_ids' => [], 'window_days' => 60],
                'message' => 'Hi {name}, your favourites are back on special at Bake & Grill this weekend. See you soon.',
            ],
            [
                'key' => 'weekend_push',
                'label' => 'Weekend push',
                'description' => 'Repeat customers who ordered in the last 90 days.',
                'needs' => null,
                'criteria' => ['min_orders' => 2, 'last_order_days' => 90],
                'message' => 'Weekend at Bake & Grill: fresh bakes from 7am and the grill on all day. Order ahead online and skip the queue.',
            ],
            [
                'key' => 'delivery_regulars',
                'label' => 'Delivery regulars',
                'description' => 'Customers who had a delivery in the last 90 days.',
                'needs' => null,
                'criteria' => ['order_types' => ['delivery'], 'window_days' => 90],
                'message' => 'Hi {name}, free delivery on Bake & Grill orders over MVR 300 tonight. Order online before 9pm.',
            ],
            [
                'key' => 'vip_thank_you',
                'label' => 'Thank the top spenders',
                'description' => 'Customers who have spent MVR 1,000 or more with you.',
                'needs' => null,
                'criteria' => ['min_spend_mvr' => 1000],
                'message' => 'Hi {name}, thank you for being one of our best customers. Your next coffee at Bake & Grill is on us: show this text.',
            ],
            [
                'key' => 'birthday_month',
                'label' => 'Birthday this month',
                'description' => 'Customers whose birthday falls in the current month.',
                'needs' => null,
                'criteria' => ['birthday_month' => (int) now(config('app.timezone', 'Indian/Maldives'))->format('n')],
                'message' => 'Happy birthday month, {name}! Celebrate at Bake & Grill: a free slice of cake with any order this month. Show this text.',
            ],
            [
                'key' => 'first_order_nudge',
                'label' => 'Never ordered yet',
                'description' => 'Signed up but never placed a paid order.',
                'needs' => null,
                'criteria' => ['segment' => 'no_order_yet'],
                'message' => 'Hi {name}, your first Bake & Grill order is waiting. 10% off when you order online this week.',
            ],
        ];
    }
}
