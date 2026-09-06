<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Support;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * What a purchase actually cost, measured by what arrived.
 *
 * Owner, 2026-09-06: "So now will that amount will be deducted in the total
 * expense if the po is cancelled?" Checking turned up that it would, and that
 * the number was wrong before the cancel as well.
 *
 * Every money report summed `purchases.total` — the *ordered* amount — over
 * orders whose status was `received` or `partial`. Both halves of that are
 * wrong for a part delivery:
 *
 *   - Four of ten sacks arrive, MVR 80 of real money leaves, and COGS says
 *     MVR 200 because that is what the order was for.
 *   - Short-close the rest and the status becomes `cancelled`, so the order
 *     drops out of the filter and COGS says MVR 0 — while four sacks sit on
 *     the shelf, paid for.
 *
 * The status was standing in for a question it cannot answer. **The only
 * honest measure is the value of what was received**, summed off the lines:
 * `received_quantity × unit_cost`. It needs no status filter at all, and it is
 * right in every case by construction — a draft has received nothing and
 * contributes nothing, a cancelled order keeps whatever genuinely arrived
 * before it was called off, and a full receipt equals the order total.
 *
 * On GST — owner, 2026-09-06: "gst not return in cafe." The café never claims
 * input tax back, so the price typed on a line IS the money handed over, tax
 * and all, and there is nothing to add or strip. An earlier version scaled
 * these figures up by the order's GST rate for a "with GST" view, which
 * invented 8% of spend that never existed. For the rare purchase entered with
 * a proper tax invoice and the claim ticked, the lines are typed ex-GST and
 * the claimed tax comes back — so the entered line value is the true cost in
 * that case too. One number, no tax arithmetic: what was typed is what it
 * cost.
 */
final class PurchaseSpendQuery
{
    /** The money a received line cost: what was typed, times what arrived. */
    public const RECEIVED_COST = 'purchase_items.received_quantity * purchase_items.unit_cost';

    /**
     * Received purchase lines in a date window, ready to aggregate.
     *
     * Dated on delivery where one is recorded, falling back to the order date:
     * money belongs to the day the goods came, and a purchase raised in one
     * month and delivered the next belongs to the second.
     *
     * No status filter, on purpose — see the class docblock. A row only
     * reaches here by having `received_quantity > 0`, which is the fact the
     * status was being used to approximate.
     */
    public static function lines(string $fromDate, string $toDate): Builder
    {
        return self::allLines()
            ->whereRaw(
                'DATE(COALESCE(purchases.actual_delivery_date, purchases.purchase_date)) BETWEEN ? AND ?',
                [$fromDate, $toDate],
            );
    }

    /**
     * The same received lines with no date window, for lifetime figures.
     */
    public static function allLines(): Builder
    {
        return DB::table('purchase_items')
            ->join('purchases', 'purchases.id', '=', 'purchase_items.purchase_id')
            // Soft-deleted purchases are gone from every screen; their money
            // goes with them. A raw join has no global scope to do this.
            ->whereNull('purchases.deleted_at')
            ->where('purchase_items.received_quantity', '>', 0);
    }

    /** Total spent on what was received in the window. */
    public static function total(string $fromDate, string $toDate): float
    {
        return round((float) self::lines($fromDate, $toDate)
            ->sum(DB::raw(self::RECEIVED_COST)), 2);
    }

    /**
     * Spend per day, keyed by date string.
     *
     * @return array<string, float>
     */
    public static function byDay(string $fromDate, string $toDate): array
    {
        return self::lines($fromDate, $toDate)
            ->selectRaw('DATE(COALESCE(purchases.actual_delivery_date, purchases.purchase_date)) as d')
            ->selectRaw('SUM(' . self::RECEIVED_COST . ') as amount')
            ->groupByRaw('DATE(COALESCE(purchases.actual_delivery_date, purchases.purchase_date))')
            ->pluck('amount', 'd')
            ->map(fn ($v) => round((float) $v, 2))
            ->all();
    }
}
