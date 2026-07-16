<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Support;

/**
 * SQL fragments for aggregating money in laar with legacy decimal fallback.
 */
final class ReportMoneySql
{
    public const ORDER_SUBTOTAL_LAAR = 'COALESCE(orders.subtotal_laar, ROUND(orders.subtotal * 100))';

    public const ORDER_TAX_LAAR = 'COALESCE(orders.tax_laar, ROUND(orders.tax_amount * 100))';

    public const ORDER_DISCOUNT_LAAR = 'COALESCE(ROUND(orders.discount_amount * 100), 0)';

    public const ORDER_SERVICE_CHARGE_LAAR = 'COALESCE(orders.service_charge_amount_laar, ROUND(COALESCE(orders.service_charge_amount, 0) * 100))';

    public const ORDER_DELIVERY_FEE_LAAR = 'COALESCE(orders.delivery_fee_laar, ROUND(orders.delivery_fee * 100))';

    public const ORDER_TOTAL_LAAR = 'COALESCE(orders.total_laar, ROUND(orders.total * 100))';

    public const ORDER_TIP_LAAR = 'ROUND(COALESCE(orders.tip_amount, 0) * 100)';

    public const PAYMENT_AMOUNT_LAAR = 'COALESCE(payments.amount_laar, ROUND(payments.amount * 100))';

    /** Aggregate paid tenders — treat amount_laar=0 as missing (COALESCE alone would keep 0). */
    public const PAYMENT_SUM_LAAR = 'COALESCE(SUM(COALESCE(amount_laar, ROUND(amount * 100))), 0)';

    public const REFUND_AMOUNT_LAAR = 'ROUND(refunds.amount * 100)';

    /**
     * Order statuses that represent counted sales.
     * Includes `paid` — POS settle leaves tickets paid until kitchen/cashier
     * marks completed; excluding it undercounted almost all counter sales.
     */
    public const SALE_STATUSES = ['paid', 'completed', 'delivered', 'partially_refunded'];

    public static function sumLaarAsMvr(string $expr): string
    {
        return 'ROUND(COALESCE(SUM(' . $expr . '), 0) / 100.0, 2)';
    }
}
