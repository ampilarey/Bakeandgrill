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
 * On GST — owner, 2026-09-06: "gst not return in cafe." The price typed on a
 * line IS the money handed over, tax and all; an earlier version scaled these
 * figures up by the order's GST rate for a "with GST" view, which invented 8%
 * of spend that never existed. Then, owner 2026-09-07: "some items are
 * eligible for GST return." For a line bought with claimable GST, on a
 * purchase whose tax invoice is on file, the GST inside the typed price comes
 * back from MIRA — so that part was never the cost. The cost of a received
 * line is what was typed, times what arrived, less the share of the line's
 * GST that will come back. Blocked GST (no tax invoice) stays in the cost:
 * it is money gone until the invoice turns up.
 */
final class PurchaseSpendQuery
{
    /**
     * The GST on a received line that will come back, in MVR: the line's GST
     * in proportion to what arrived, only when the purchase can claim it.
     */
    public const CLAIMABLE_GST = '(CASE WHEN purchases.is_input_tax_claimable = true AND purchase_items.quantity > 0 AND purchase_items.gst_laar > 0'
        . ' THEN (purchase_items.received_quantity / purchase_items.quantity) * (purchase_items.gst_laar / 100.0) ELSE 0 END)';

    /** The money a received line cost: what was typed, times what arrived, less the GST that comes back. */
    public const RECEIVED_COST = '(purchase_items.received_quantity * purchase_items.unit_cost - ' . self::CLAIMABLE_GST . ')';

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

    /** Total spent on what was received in the window, net of GST that comes back. */
    public static function total(string $fromDate, string $toDate): float
    {
        return round((float) self::lines($fromDate, $toDate)
            ->sum(DB::raw(self::RECEIVED_COST)), 2);
    }

    /**
     * The GST inside the window's received lines that will come back from
     * MIRA — already left out of total(); shown so the owner can see it.
     */
    public static function claimableGst(string $fromDate, string $toDate): float
    {
        return round((float) self::lines($fromDate, $toDate)
            ->sum(DB::raw(self::CLAIMABLE_GST)), 2);
    }

    /**
     * GST on received lines that could come back but cannot be claimed yet —
     * the purchase has no tax invoice on file. Still counted as cost.
     */
    public static function blockedGst(string $fromDate, string $toDate): float
    {
        return round((float) self::lines($fromDate, $toDate)
            ->sum(DB::raw('(CASE WHEN (purchases.is_input_tax_claimable IS NULL OR purchases.is_input_tax_claimable = false) AND purchase_items.quantity > 0 AND purchase_items.gst_laar > 0'
                . ' THEN (purchase_items.received_quantity / purchase_items.quantity) * (purchase_items.gst_laar / 100.0) ELSE 0 END)')), 2);
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
