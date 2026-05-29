<?php

declare(strict_types=1);

namespace App\Domains\Customers\Support;

use App\Models\Order;
use Illuminate\Database\Eloquent\Builder;

final class CustomerPaidOrderQuery
{
    /** @var list<string> */
    public const EXCLUDED_STATUSES = ['cancelled', 'refunded', 'partially_refunded'];

    /** @return Builder<Order> */
    public static function apply(Builder $query): Builder
    {
        return $query
            ->whereNotNull('paid_at')
            ->whereNotIn('status', self::EXCLUDED_STATUSES);
    }

    /** @return Builder<Order> */
    public static function base(): Builder
    {
        return self::apply(Order::query());
    }
}
