<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Domains\Customers\Services\CustomerSegmentationService;
use App\Models\Category;
use App\Models\Item;

/**
 * What a campaign audience can be built from (SMS audit, 2026-09-24).
 *
 * The owner asked for "advanced promotions based on customer purchases".
 * Until now a campaign could pick a CRM segment, a loyalty tier and "ordered
 * in the last N days". These keys add what people actually bought:
 *
 *   bought_item_ids / bought_category_ids   bought any of these in the window
 *   not_bought_item_ids                     never bought any of these (ever)
 *   likes_item_id                           bought it, or bought what usually
 *                                           goes with it (item affinity)
 *   order_types                             ordered this way in the window
 *   window_days                             the window for the three above
 *                                           (default 90)
 *   min_spend_mvr / min_orders              paid totals, all time
 *   dormant_days                            last paid order older than N days
 *   birthday_month                          1–12
 *   audience_id                             a saved audience: its criteria are
 *                                           the base, inline keys override
 *
 * Every key intersects. Opted-out numbers are excluded unless `opted_in` is
 * explicitly false. "Bought" always means a paid order that was not cancelled
 * or refunded (CustomerPaidOrderQuery), the same definition the CRM uses.
 */
final class SmsAudienceCriteria
{
    public const DEFAULT_WINDOW_DAYS = 90;

    /** @var array<string, string> */
    public const ORDER_TYPES = [
        'dine_in' => 'Dine-in',
        'takeaway' => 'Takeaway',
        'online_pickup' => 'Online pickup',
        'delivery' => 'Delivery',
    ];

    /** @var list<string> */
    public const KEYS = [
        'audience_id', 'segment', 'tier', 'last_order_days', 'opted_in', 'has_loyalty',
        'bought_item_ids', 'bought_category_ids', 'not_bought_item_ids', 'likes_item_id',
        'order_types', 'window_days', 'min_spend_mvr', 'min_orders', 'dormant_days', 'birthday_month',
    ];

    /**
     * Validation rules for a request field holding criteria.
     *
     * @return array<string, string>
     */
    public static function rules(string $field = 'target_criteria'): array
    {
        return [
            $field => 'nullable|array',
            "{$field}.audience_id" => 'nullable|integer|exists:sms_audiences,id',
            "{$field}.segment" => 'nullable|string|in:' . implode(',', array_keys(CustomerSegmentationService::SEGMENTS)),
            "{$field}.tier" => 'nullable|array',
            "{$field}.tier.*" => 'in:bronze,silver,gold,platinum',
            "{$field}.last_order_days" => 'nullable|integer|min:1|max:3650',
            "{$field}.opted_in" => 'nullable|boolean',
            "{$field}.has_loyalty" => 'nullable|boolean',
            "{$field}.bought_item_ids" => 'nullable|array|max:50',
            "{$field}.bought_item_ids.*" => 'integer|exists:items,id',
            "{$field}.bought_category_ids" => 'nullable|array|max:50',
            "{$field}.bought_category_ids.*" => 'integer|exists:categories,id',
            "{$field}.not_bought_item_ids" => 'nullable|array|max:50',
            "{$field}.not_bought_item_ids.*" => 'integer|exists:items,id',
            "{$field}.likes_item_id" => 'nullable|integer|exists:items,id',
            "{$field}.order_types" => 'nullable|array',
            "{$field}.order_types.*" => 'in:' . implode(',', array_keys(self::ORDER_TYPES)),
            "{$field}.window_days" => 'nullable|integer|min:1|max:3650',
            "{$field}.min_spend_mvr" => 'nullable|numeric|min:0|max:100000000',
            "{$field}.min_orders" => 'nullable|integer|min:1|max:100000',
            "{$field}.dormant_days" => 'nullable|integer|min:1|max:3650',
            "{$field}.birthday_month" => 'nullable|integer|min:1|max:12',
        ];
    }

    /**
     * Drop unknown keys and empty values so what is stored is only what was
     * chosen.
     *
     * @param array<string, mixed> $criteria
     * @return array<string, mixed>
     */
    public static function clean(array $criteria): array
    {
        $out = [];
        foreach (self::KEYS as $key) {
            if (!array_key_exists($key, $criteria)) {
                continue;
            }
            $value = $criteria[$key];
            if ($value === null || $value === '' || $value === []) {
                continue;
            }
            if ($key === 'segment') {
                $value = (string) $value;
            } elseif (in_array($key, ['tier', 'order_types'], true)) {
                $value = array_values(array_unique(array_map('strval', (array) $value)));
            } elseif (str_ends_with($key, '_ids')) {
                $value = array_values(array_unique(array_filter(array_map('intval', (array) $value))));
                if ($value === []) {
                    continue;
                }
            } elseif (in_array($key, ['opted_in', 'has_loyalty'], true)) {
                $value = filter_var($value, FILTER_VALIDATE_BOOLEAN);
            } elseif ($key === 'min_spend_mvr') {
                $value = round((float) $value, 2);
            } else {
                $value = (int) $value;
            }
            $out[$key] = $value;
        }

        return $out;
    }

    /**
     * A one-line description for the campaign table and the preview box,
     * e.g. "Bought Chicken Burger in the last 60 days · Delivery · Spent MVR 500+".
     *
     * @param array<string, mixed> $criteria
     */
    public static function describe(array $criteria): string
    {
        $c = self::clean($criteria);
        $parts = [];
        $window = (int) ($c['window_days'] ?? self::DEFAULT_WINDOW_DAYS);
        $inWindow = " in the last {$window} days";

        if (!empty($c['segment'])) {
            $parts[] = CustomerSegmentationService::SEGMENTS[$c['segment']] ?? $c['segment'];
        }
        if (!empty($c['tier'])) {
            $parts[] = 'Tier ' . implode('/', array_map('ucfirst', $c['tier']));
        }
        if (!empty($c['bought_item_ids'])) {
            $parts[] = 'Bought ' . self::names(Item::class, $c['bought_item_ids']) . $inWindow;
        }
        if (!empty($c['bought_category_ids'])) {
            $parts[] = 'Bought from ' . self::names(Category::class, $c['bought_category_ids']) . $inWindow;
        }
        if (!empty($c['likes_item_id'])) {
            $parts[] = 'Likes ' . self::names(Item::class, [$c['likes_item_id']]) . $inWindow;
        }
        if (!empty($c['not_bought_item_ids'])) {
            $parts[] = 'Never bought ' . self::names(Item::class, $c['not_bought_item_ids']);
        }
        if (!empty($c['order_types'])) {
            $parts[] = implode('/', array_map(fn ($t) => self::ORDER_TYPES[$t] ?? $t, $c['order_types'])) . $inWindow;
        }
        if (!empty($c['min_spend_mvr'])) {
            $parts[] = 'Spent MVR ' . number_format((float) $c['min_spend_mvr'], 0) . '+';
        }
        if (!empty($c['min_orders'])) {
            $parts[] = $c['min_orders'] . '+ paid orders';
        }
        if (!empty($c['last_order_days'])) {
            $parts[] = 'Ordered in the last ' . $c['last_order_days'] . ' days';
        }
        if (!empty($c['dormant_days'])) {
            $parts[] = 'No order for ' . $c['dormant_days'] . '+ days';
        }
        if (!empty($c['birthday_month'])) {
            $parts[] = 'Birthday in ' . date('F', mktime(0, 0, 0, (int) $c['birthday_month'], 1));
        }
        if (!empty($c['has_loyalty'])) {
            $parts[] = 'Loyalty members';
        }
        if (array_key_exists('opted_in', $c) && $c['opted_in'] === false) {
            $parts[] = 'Including opted-out';
        }

        return $parts === [] ? 'All SMS opt-in customers' : implode(' · ', $parts);
    }

    /**
     * @param class-string<\Illuminate\Database\Eloquent\Model> $model
     * @param list<int> $ids
     */
    private static function names(string $model, array $ids): string
    {
        $names = $model::query()->whereIn('id', $ids)->pluck('name')->map('strval')->all();
        if ($names === []) {
            return count($ids) . ' item' . (count($ids) === 1 ? '' : 's');
        }
        $shown = array_slice($names, 0, 3);
        $more = count($names) - count($shown);

        return implode(', ', $shown) . ($more > 0 ? " +{$more} more" : '');
    }
}
