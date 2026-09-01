<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Credit\Services\CreditEligibilityService;
use App\Domains\Orders\Support\EffectiveDiscount;
use App\Domains\Payments\Services\PaymentCommissionService;
use App\Domains\Reporting\Support\ReportMoneySql;
use App\Domains\Trade\Services\WholesaleChannelAggregator;
use App\Models\AuditLog;
use App\Models\CashMovement;
use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use App\Models\CustomerDepositLedger;
use App\Models\InventoryItem;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\PurchaseItem;
use App\Models\Refund;
use App\Models\Shift;
use App\Models\SupplierPriceHistory;
use App\Models\User;
use App\Services\RecipeCostCalculator;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * All reporting aggregate queries in one place.
 * The ReportsController is a thin HTTP layer that calls these methods.
 * Swap the underlying queries here without touching routing or HTTP concerns.
 */
class ReportsService
{
    /** @var list<string> */
    private const PAYMENT_STATUSES = ['paid', 'completed', 'confirmed'];

    /**
     * Sales summary totals and payment breakdown for a date range.
     */
    public function salesSummary(Carbon $from, Carbon $to, ?int $userId = null, ?int $shiftId = null, ?int $deviceId = null): array
    {
        // REVENUE DATE (order-for-tomorrow): sales reports use payment/create
        // time (`orders.created_at`), NOT `fulfil_date`. Money moved today
        // counts as today's revenue; fulfil_date is for kitchen planning only.
        // Do not silently switch this to collection date without an explicit
        // product decision.
        //
        // Gift-card purchase orders are tender loads — not merchandise sales.
        // They surface in dedicated `gift_cards_sold_*` fields (below) but must
        // never inflate sales totals, tax, discount, or category breakdowns.
        $orderBase = Order::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->where(function ($q) {
                $q->whereNull('type')->orWhere('type', '!=', 'gift_card');
            })
            ->when($userId, fn ($q) => $q->where('user_id', $userId))
            ->when($shiftId, fn ($q) => $q->where('shift_id', $shiftId))
            ->when($deviceId, fn ($q) => $q->where('device_id', $deviceId));

        $subLaar = ReportMoneySql::ORDER_SUBTOTAL_LAAR;
        $taxLaar = ReportMoneySql::ORDER_TAX_LAAR;
        $discLaar = ReportMoneySql::ORDER_DISCOUNT_LAAR;
        $scLaar = ReportMoneySql::ORDER_SERVICE_CHARGE_LAAR;
        $delLaar = ReportMoneySql::ORDER_DELIVERY_FEE_LAAR;
        $totalLaar = ReportMoneySql::ORDER_TOTAL_LAAR;

        $agg = (clone $orderBase)
            ->selectRaw('COUNT(*) as orders_count')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($subLaar) . ' as subtotal')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($taxLaar) . ' as tax_amount')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($discLaar) . ' as discount_amount')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($scLaar) . ' as service_charge_total')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($delLaar) . ' as delivery_fee_total')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($totalLaar) . ' as total')
            ->first();

        $totals = [
            'orders_count' => (int) ($agg->orders_count ?? 0),
            'subtotal' => (float) ($agg->subtotal ?? 0),
            'tax_amount' => (float) ($agg->tax_amount ?? 0),
            'discount_amount' => (float) ($agg->discount_amount ?? 0),
            'service_charge_total' => (float) ($agg->service_charge_total ?? 0),
            'delivery_fee_total' => (float) ($agg->delivery_fee_total ?? 0),
            'total' => (float) ($agg->total ?? 0),
        ];

        // Always tie payment breakdown to the same completed-order cohort as
        // $totals above. Pre-fix, with cashier/shift/station = All, this
        // summed every paid payment in the date window — including orders
        // still pending/held — so revenue and payment lines disagreed wildly.
        $payLaar = ReportMoneySql::PAYMENT_AMOUNT_LAAR;
        $payments = Payment::query()
            ->whereBetween('processed_at', [$from, $to])
            ->whereIn('status', self::PAYMENT_STATUSES)
            ->whereHas('order', function ($oq) use ($from, $to, $userId, $shiftId, $deviceId) {
                $oq->whereIn('status', ReportMoneySql::SALE_STATUSES)
                    ->whereBetween('created_at', [$from, $to])
                    ->where(function ($q) {
                        $q->whereNull('type')->orWhere('type', '!=', 'gift_card');
                    })
                    ->when($userId, fn ($q2) => $q2->where('user_id', $userId))
                    ->when($shiftId, fn ($q2) => $q2->where('shift_id', $shiftId))
                    ->when($deviceId, fn ($q2) => $q2->where('device_id', $deviceId));
            })
            ->select('method', DB::raw('ROUND(COALESCE(SUM(' . $payLaar . '), 0) / 100.0, 2) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

        [$gcSoldCount, $gcSoldLaar] = $this->giftCardsSoldInRange(
            $from,
            $to,
            $userId,
            $shiftId,
            $deviceId,
        );

        // FIX 7: split total into "collected" (real tenders) vs "on credit"
        // (house_account — receivable). house_account is a receivable, NOT
        // cash, and totals were being read as though everything was
        // collected. Downstream P&L / cash-flow decisions were off by the
        // outstanding-credit-account balance.
        [$collectedLaar, $onCreditLaar] = $this->tenderSplitLaar($payments);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'filters' => array_filter([
                'user_id' => $userId,
                'shift_id' => $shiftId,
                'device_id' => $deviceId,
            ]),
            'totals' => $totals,
            'gift_cards_sold_count' => $gcSoldCount,
            'gift_cards_sold_laar' => $gcSoldLaar,
            'gift_cards_sold' => round($gcSoldLaar / 100, 2),
            'payments' => $payments,
            'collected_laar' => $collectedLaar,
            'collected' => round($collectedLaar / 100, 2),
            'on_credit_laar' => $onCreditLaar,
            'on_credit' => round($onCreditLaar / 100, 2),
            'payment_commission' => app(PaymentCommissionService::class)->paymentCommissionSummary($from, $to, array_filter([
                'user_id' => $userId,
                'shift_id' => $shiftId,
                'device_id' => $deviceId,
            ])),
            // Stage F — wholesale is a sibling channel; retail `totals` stay order-only.
            'wholesale' => app(WholesaleChannelAggregator::class)->summary($from, $to),
        ];
    }

    /**
     * Split the `method => total_mvr` payment breakdown into "collected"
     * (real money in — cash, card, gateway, wallet, gift-card tender, etc.)
     * versus "on credit" (house_account — receivable).
     *
     * Returns totals in LAARI to preserve integer precision downstream.
     *
     * @param \Illuminate\Support\Collection<string, mixed> $payments
     * @return array{0: int, 1: int}
     */
    private function tenderSplitLaar($payments): array
    {
        $collected = 0;
        $onCredit = 0;
        foreach ($payments as $method => $totalMvr) {
            $laar = (int) round(((float) $totalMvr) * 100);
            if ((string) $method === 'house_account') {
                $onCredit += $laar;
            } else {
                $collected += $laar;
            }
        }

        return [$collected, $onCredit];
    }

    /**
     * Sum of credit-repayment cash movements for a shift-window (X) or
     * date-window (Z). expectedCashFor already includes these in the
     * generic cash_in total — this method just breaks them out.
     */
    private function creditRepaymentsCashLaar(Carbon $from, Carbon $to, ?int $shiftId = null): int
    {
        return (int) CashMovement::query()
            ->where('type', 'cash_in')
            ->where('category', 'credit_repayment')
            ->whereBetween('created_at', [$from, $to])
            ->when($shiftId, fn ($q) => $q->where('shift_id', $shiftId))
            ->selectRaw('COALESCE(ROUND(SUM(amount) * 100), 0) as t')
            ->value('t');
    }

    /**
     * Gift card orders sold in the window — same status set as merchandise,
     * with same POS filters. Returns [count, totalLaar].
     *
     * @return array{0: int, 1: int}
     */
    private function giftCardsSoldInRange(
        Carbon $from,
        Carbon $to,
        ?int $userId = null,
        ?int $shiftId = null,
        ?int $deviceId = null,
    ): array {
        $totalLaar = ReportMoneySql::ORDER_TOTAL_LAAR;

        $row = Order::query()
            ->where('type', 'gift_card')
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->when($userId, fn ($q) => $q->where('user_id', $userId))
            ->when($shiftId, fn ($q) => $q->where('shift_id', $shiftId))
            ->when($deviceId, fn ($q) => $q->where('device_id', $deviceId))
            ->selectRaw('COUNT(*) as gc_count')
            ->selectRaw('COALESCE(SUM(' . $totalLaar . '), 0) as gc_total_laar')
            ->first();

        return [
            (int) ($row->gc_count ?? 0),
            (int) ($row->gc_total_laar ?? 0),
        ];
    }

    /**
     * Sales breakdown by item, category, and employee for a date range.
     */
    public function salesBreakdown(Carbon $from, Carbon $to, int $limit = 100): array
    {
        // Same rule as salesSummary — gift-card purchases carry no line items
        // (or their virtual "Gift card" line would inflate item / category
        // rankings), so drop them from every rollup here.
        $excludeGiftCard = fn ($q) => $q
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->where(function ($q2) {
                $q2->whereNull('type')->orWhere('type', '!=', 'gift_card');
            });

        $items = OrderItem::select(
            'item_id',
            'item_name',
            DB::raw('SUM(quantity) as quantity'),
            DB::raw('SUM(total_price) as total'),
        )
            ->whereHas('order', $excludeGiftCard)
            ->groupBy('item_id', 'item_name')
            ->orderByDesc('total')
            ->limit(min($limit, 500))
            ->get();

        $categories = OrderItem::select(
            'categories.id as category_id',
            'categories.name as category_name',
            DB::raw('SUM(order_items.quantity) as quantity'),
            DB::raw('SUM(order_items.total_price) as total'),
        )
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->join('categories', 'categories.id', '=', 'items.category_id')
            ->whereHas('order', $excludeGiftCard)
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('total')
            ->limit(50)
            ->get();

        $employees = Order::leftJoin('users', 'users.id', '=', 'orders.user_id')
            ->select('orders.user_id', 'users.name', DB::raw('COUNT(*) as orders_count'))
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as total')
            ->whereBetween('orders.created_at', [$from, $to])
            ->whereIn('orders.status', ReportMoneySql::SALE_STATUSES)
            ->where(function ($q) {
                $q->whereNull('orders.type')->orWhere('orders.type', '!=', 'gift_card');
            })
            ->groupBy('orders.user_id', 'users.name')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'user_id' => $row->user_id,
                'name' => $row->name,
                'orders_count' => (int) $row->orders_count,
                'total' => (float) $row->total,
            ]);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'items' => $items,
            'categories' => $categories,
            'employees' => $employees,
            // Stage F — parallel rollup; retail `items` unchanged.
            'wholesale_items' => app(WholesaleChannelAggregator::class)->topItems($from, $to, $limit),
        ];
    }

    /**
     * X-Report: mid-shift totals for the currently open shift of the given user.
     * Returns null if no active shift exists.
     *
     * FIX 10 — money figures (tender breakdown, cash expected) derive from
     * Payment::where('shift_id', $shift->id). Sales *counts* remain based
     * on Order::user_id so cashier A still sees their in-flight tickets
     * even if cashier B ultimately settles them. Online / shift-less
     * payments are labelled "online (no shift)" only in Z; X ignores them.
     */
    public function xReport(int $userId): ?array
    {
        $shift = Shift::where('user_id', $userId)->whereNull('closed_at')->latest('opened_at')->first();

        if (!$shift) {
            return null;
        }

        $from = $shift->opened_at;
        $to = now();

        $agg = Order::where('user_id', $shift->user_id)
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->where(function ($q) {
                $q->whereNull('type')->orWhere('type', '!=', 'gift_card');
            })
            ->selectRaw('COUNT(*) as orders_count')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_SUBTOTAL_LAAR) . ' as subtotal')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TAX_LAAR) . ' as tax_amount')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_DISCOUNT_LAAR) . ' as discount_amount')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_SERVICE_CHARGE_LAAR) . ' as service_charge_total')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as total')
            ->first();

        $totals = [
            'orders_count' => (int) ($agg->orders_count ?? 0),
            'subtotal' => (float) ($agg->subtotal ?? 0),
            'tax_amount' => (float) ($agg->tax_amount ?? 0),
            'discount_amount' => (float) ($agg->discount_amount ?? 0),
            'service_charge_total' => (float) ($agg->service_charge_total ?? 0),
            'total' => (float) ($agg->total ?? 0),
        ];

        // FIX 10: tender breakdown attributes money to whoever actually
        // collected it (payments.shift_id), not whoever rang the order.
        // Rows with shift_id = NULL (online/gateway) are excluded from X.
        $payLaar = ReportMoneySql::PAYMENT_AMOUNT_LAAR;
        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', self::PAYMENT_STATUSES)
            ->where('shift_id', $shift->id)
            ->whereHas('order', function ($oq) {
                $oq->where(function ($q) {
                    $q->whereNull('type')->orWhere('type', '!=', 'gift_card');
                });
            })
            ->select('method', DB::raw('ROUND(COALESCE(SUM(' . $payLaar . '), 0) / 100.0, 2) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

        $refundsTotal = Refund::whereBetween('created_at', [$from, $to])
            ->whereHas('order', fn ($q) => $q->where('user_id', $shift->user_id))
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::REFUND_AMOUNT_LAAR) . ' as total')
            ->value('total');

        [$gcSoldCount, $gcSoldLaar] = $this->giftCardsSoldInRange($from, $to, $shift->user_id);

        [$collectedLaar, $onCreditLaar] = $this->tenderSplitLaar($payments);
        $creditRepaymentsCashLaar = $this->creditRepaymentsCashLaar($from, $to, $shift->id);

        return [
            'shift' => $shift,
            'from' => $from->toDateTimeString(),
            'to' => $to->toDateTimeString(),
            'totals' => $totals,
            'gift_cards_sold_count' => $gcSoldCount,
            'gift_cards_sold_laar' => $gcSoldLaar,
            'gift_cards_sold' => round($gcSoldLaar / 100, 2),
            'payments' => $payments,
            'collected_laar' => $collectedLaar,
            'collected' => round($collectedLaar / 100, 2),
            'on_credit_laar' => $onCreditLaar,
            'on_credit' => round($onCreditLaar / 100, 2),
            'credit_repayments_cash_laar' => $creditRepaymentsCashLaar,
            'credit_repayments_cash' => round($creditRepaymentsCashLaar / 100, 2),
            'refunds' => $refundsTotal,
            'payment_commission' => app(PaymentCommissionService::class)->paymentCommissionSummary($from, $to, [
                'user_id' => $shift->user_id,
            ]),
        ];
    }

    /**
     * Z-Report: end-of-day totals for a date range.
     */
    public function zReport(Carbon $from, Carbon $to): array
    {
        $agg = Order::whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->where(function ($q) {
                $q->whereNull('type')->orWhere('type', '!=', 'gift_card');
            })
            ->selectRaw('COUNT(*) as orders_count')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_SUBTOTAL_LAAR) . ' as subtotal')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TAX_LAAR) . ' as tax_amount')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_DISCOUNT_LAAR) . ' as discount_amount')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_SERVICE_CHARGE_LAAR) . ' as service_charge_total')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as total')
            ->first();

        $totals = [
            'orders_count' => (int) ($agg->orders_count ?? 0),
            'subtotal' => (float) ($agg->subtotal ?? 0),
            'tax_amount' => (float) ($agg->tax_amount ?? 0),
            'discount_amount' => (float) ($agg->discount_amount ?? 0),
            'service_charge_total' => (float) ($agg->service_charge_total ?? 0),
            'total' => (float) ($agg->total ?? 0),
        ];

        $payLaar = ReportMoneySql::PAYMENT_AMOUNT_LAAR;
        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', self::PAYMENT_STATUSES)
            ->whereHas('order', fn ($q) => $q
                ->whereIn('status', ReportMoneySql::SALE_STATUSES)
                ->whereBetween('created_at', [$from, $to])
                ->where(function ($q2) {
                    $q2->whereNull('type')->orWhere('type', '!=', 'gift_card');
                }))
            ->select('method', DB::raw('ROUND(COALESCE(SUM(' . $payLaar . '), 0) / 100.0, 2) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

        // FIX 10: Z-report exposes the "no-shift" (online / gateway) bucket
        // separately so venue-level revenue is complete but reporting UIs can
        // distinguish cashier-collected from gateway-collected money.
        $noShiftTotal = (float) Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', self::PAYMENT_STATUSES)
            ->whereNull('shift_id')
            ->whereHas('order', fn ($q) => $q
                ->whereIn('status', ReportMoneySql::SALE_STATUSES)
                ->whereBetween('created_at', [$from, $to])
                ->where(function ($q2) {
                    $q2->whereNull('type')->orWhere('type', '!=', 'gift_card');
                }))
            ->selectRaw('ROUND(COALESCE(SUM(' . $payLaar . '), 0) / 100.0, 2) as t')
            ->value('t');

        $refunds = Refund::whereBetween('created_at', [$from, $to])
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::REFUND_AMOUNT_LAAR) . ' as total')
            ->value('total');

        [$gcSoldCount, $gcSoldLaar] = $this->giftCardsSoldInRange($from, $to);

        [$collectedLaar, $onCreditLaar] = $this->tenderSplitLaar($payments);
        $creditRepaymentsCashLaar = $this->creditRepaymentsCashLaar($from, $to);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => $totals,
            'gift_cards_sold_count' => $gcSoldCount,
            'gift_cards_sold_laar' => $gcSoldLaar,
            'gift_cards_sold' => round($gcSoldLaar / 100, 2),
            'payments' => $payments,
            'collected_laar' => $collectedLaar,
            'collected' => round($collectedLaar / 100, 2),
            'on_credit_laar' => $onCreditLaar,
            'on_credit' => round($onCreditLaar / 100, 2),
            'credit_repayments_cash_laar' => $creditRepaymentsCashLaar,
            'credit_repayments_cash' => round($creditRepaymentsCashLaar / 100, 2),
            'payments_no_shift_total' => $noShiftTotal,
            'refunds' => $refunds,
            'payment_commission' => app(PaymentCommissionService::class)->paymentCommissionSummary($from, $to),
        ];
    }

    /**
     * Inventory valuation — aggregate + per-item breakdown.
     * Negative on-hand is reported separately and excluded from positive totals.
     */
    public function inventoryValuation(): array
    {
        $items = InventoryItem::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'unit', 'current_stock', 'unit_cost']);

        $rows = [];
        $value = 0.0;
        $quantity = 0.0;
        $negativeValue = 0.0;
        $negativeCount = 0;

        foreach ($items as $item) {
            $qty = (float) ($item->current_stock ?? 0);
            $cost = (float) ($item->unit_cost ?? 0);
            $lineValue = round($qty * $cost, 2);
            $rows[] = [
                'id' => $item->id,
                'name' => $item->name,
                'unit' => $item->unit,
                'quantity' => $qty,
                'cost_per_unit' => $cost,
                'total_value' => $lineValue,
                'is_negative' => $qty < 0,
            ];
            if ($qty < 0) {
                $negativeCount++;
                $negativeValue += $lineValue;
            } else {
                $value += $lineValue;
                $quantity += $qty;
            }
        }

        return [
            'value' => round($value, 2),
            'quantity' => round($quantity, 3),
            'negative_stock_count' => $negativeCount,
            'negative_stock_value' => round($negativeValue, 2),
            'items' => $rows,
        ];
    }

    /**
     * Delivery performance grouped by island/zone for completed delivery orders.
     *
     * @return array{
     *     from: string,
     *     to: string,
     *     zones: list<array{zone: string, orders_count: int, order_total: float, fees_total: float, avg_fee: float}>,
     *     totals: array{orders_count: int, order_total: float, fees_total: float}
     * }
     */
    public function deliveryZones(Carbon $from, Carbon $to): array
    {
        $orderTotalExpr = ReportMoneySql::ORDER_TOTAL_LAAR;
        $feeLaarExpr = ReportMoneySql::ORDER_DELIVERY_FEE_LAAR;

        $rows = Order::query()
            ->where('type', 'delivery')
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->whereBetween('created_at', [$from, $to])
            ->whereNotNull('delivery_island')
            ->where('delivery_island', '!=', '')
            ->selectRaw('delivery_island as zone, COUNT(*) as orders_count')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($orderTotalExpr) . ' as order_total')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($feeLaarExpr) . ' as fees_total')
            ->selectRaw('ROUND(COALESCE(AVG(' . $feeLaarExpr . '), 0) / 100.0, 2) as avg_fee')
            ->groupBy('delivery_island')
            ->orderByDesc('orders_count')
            ->get();

        $ordersCount = (int) $rows->sum('orders_count');
        $orderTotal = (float) $rows->sum('order_total');
        $feesTotal = (float) $rows->sum('fees_total');

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'zones' => $rows->map(fn ($row) => [
                'zone' => (string) $row->zone,
                'orders_count' => (int) $row->orders_count,
                'order_total' => (float) $row->order_total,
                'fees_total' => (float) $row->fees_total,
                'avg_fee' => round((float) $row->avg_fee, 2),
            ])->values()->all(),
            'totals' => [
                'orders_count' => $ordersCount,
                'order_total' => $orderTotal,
                'fees_total' => $feesTotal,
            ],
        ];
    }

    /**
     * Discount totals split by type for completed orders in range.
     *
     * @return array{from: string, to: string, rows: list<array{type: string, amount_laar: int, amount: float, orders_count: int}>}
     */
    public function discountsByType(Carbon $from, Carbon $to): array
    {
        $orders = Order::query()
            ->with('manualDiscountApprover:id,name')
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->get([
                'id',
                'order_number',
                'subtotal',
                'subtotal_laar',
                'promo_discount_laar',
                'loyalty_discount_laar',
                'manual_discount_laar',
                'manual_discount_reason',
                'manual_discount_reason_note',
                'manual_discount_approved_by',
                'gift_card_discount_laar',
                'referral_discount_laar',
            ]);

        // Gift cards are TENDER, not discounts — allocate merchandise parts only
        // (see EffectiveDiscount::merchandisePartsFromOrder). Zero'ing gift_card
        // in the merch parts also stops it from stealing allocation share when
        // the other discounts sum above subtotal.
        $types = [
            'promo' => 'promo',
            'loyalty' => 'loyalty',
            'manual' => 'manual',
            'referral' => 'referral',
        ];

        $sums = array_fill_keys(array_keys($types), 0);
        $ordersWithDiscount = array_fill_keys(array_keys($types), 0);
        $totalAppliedLaar = 0;
        $manualDetails = [];

        foreach ($orders as $order) {
            $subLaar = EffectiveDiscount::subtotalLaarFromOrder($order);
            $parts = EffectiveDiscount::merchandisePartsFromOrder($order);
            $allocated = EffectiveDiscount::allocate($subLaar, $parts);
            $effective = EffectiveDiscount::effectiveTotalLaar($subLaar, $parts);
            $totalAppliedLaar += $effective;

            foreach ($types as $label => $key) {
                $share = $allocated[$key] ?? 0;
                if ($share > 0) {
                    $ordersWithDiscount[$label]++;
                }
                $sums[$label] += $share;
            }

            $manualShare = $allocated['manual'] ?? 0;
            if ($manualShare > 0) {
                $manualDetails[] = [
                    'order_id' => (int) $order->id,
                    'order_number' => $order->order_number,
                    'amount_laar' => $manualShare,
                    'amount' => round($manualShare / 100, 2),
                    'reason' => $order->manual_discount_reason,
                    'reason_note' => $order->manual_discount_reason_note,
                    'approved_by' => $order->manualDiscountApprover?->name,
                    'approved_by_user_id' => $order->manual_discount_approved_by
                        ? (int) $order->manual_discount_approved_by
                        : null,
                ];
            }
        }

        $rows = [];
        foreach ($types as $label => $key) {
            $sumLaar = $sums[$label];
            $rows[] = [
                'type' => $label,
                'amount_laar' => $sumLaar,
                'amount' => round($sumLaar / 100, 2),
                'orders_count' => $ordersWithDiscount[$label],
            ];
        }

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'total_applied_laar' => $totalAppliedLaar,
            'total_applied' => round($totalAppliedLaar / 100, 2),
            'rows' => $rows,
            'manual_details' => $manualDetails,
        ];
    }

    /**
     * Void/cancel counts grouped by staff from audit logs.
     *
     * @return array{from: string, to: string, rows: list<array{user_id: int|null, name: string, voids_count: int}>}
     */
    public function voidsByStaff(Carbon $from, Carbon $to): array
    {
        $rows = AuditLog::query()
            ->where('action', 'order.cancelled')
            ->whereBetween('created_at', [$from, $to])
            ->select('user_id', DB::raw('COUNT(*) as voids_count'))
            ->groupBy('user_id')
            ->orderByDesc('voids_count')
            ->get();

        $names = User::query()
            ->whereIn('id', $rows->pluck('user_id')->filter())
            ->pluck('name', 'id');

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $rows->map(fn ($row) => [
                'user_id' => $row->user_id !== null ? (int) $row->user_id : null,
                'name' => $row->user_id ? (string) ($names[$row->user_id] ?? 'Unknown') : 'System',
                'voids_count' => (int) $row->voids_count,
            ])->values()->all(),
        ];
    }

    /**
     * Void/cancel counts grouped by cancellation reason.
     *
     * @return array{from: string, to: string, rows: list<array{reason: string, voids_count: int}>}
     */
    public function voidsByReason(Carbon $from, Carbon $to): array
    {
        $rows = Order::query()
            ->where('status', 'cancelled')
            ->where(function ($q) use ($from, $to) {
                $q->whereBetween('cancelled_at', [$from, $to])
                    ->orWhere(function ($q2) use ($from, $to) {
                        $q2->whereNull('cancelled_at')
                            ->whereBetween('updated_at', [$from, $to]);
                    });
            })
            ->selectRaw("COALESCE(NULLIF(TRIM(cancellation_reason), ''), 'Unspecified') as reason, COUNT(*) as voids_count")
            ->groupByRaw("COALESCE(NULLIF(TRIM(cancellation_reason), ''), 'Unspecified')")
            ->orderByDesc('voids_count')
            ->get();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $rows->map(fn ($row) => [
                'reason' => (string) $row->reason,
                'voids_count' => (int) $row->voids_count,
            ])->values()->all(),
        ];
    }

    /**
     * Refund totals grouped by reason.
     *
     * @return array{from: string, to: string, rows: list<array{reason: string, refunds_count: int, amount: float}>}
     */
    public function refundsByReason(Carbon $from, Carbon $to): array
    {
        $rows = Refund::query()
            ->whereBetween('created_at', [$from, $to])
            ->select('reason', DB::raw('COUNT(*) as refunds_count'), DB::raw('COALESCE(SUM(amount),0) as amount'))
            ->groupBy('reason')
            ->orderByDesc('amount')
            ->get();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $rows->map(fn ($row) => [
                'reason' => (string) ($row->reason ?: 'unspecified'),
                'refunds_count' => (int) $row->refunds_count,
                'amount' => round((float) $row->amount, 2),
            ])->values()->all(),
        ];
    }

    /**
     * Outstanding customer credit exposure snapshot.
     *
     * @return array{
     *     total_balance_laar: int,
     *     total_balance: float,
     *     customers_count: int,
     *     top_customers: list<array{id: int, name: string, balance_laar: int, balance: float}>
     * }
     */
    public function creditExposure(): array
    {
        $eligibility = app(CreditEligibilityService::class);
        $today = now()->toDateString();

        $totalLaar = (int) Customer::query()
            ->where('credit_balance_laar', '>', 0)
            ->sum('credit_balance_laar');

        $customersCount = (int) Customer::query()
            ->where('credit_balance_laar', '>', 0)
            ->count();

        $topCustomers = Customer::query()
            ->where('credit_balance_laar', '>', 0)
            ->orderByDesc('credit_balance_laar')
            ->limit(10)
            ->get();

        $customerIds = $topCustomers->pluck('id');

        $overdueCounts = $customerIds->isEmpty()
            ? collect()
            : Invoice::query()
                ->selectRaw('customer_id, COUNT(*) as cnt')
                ->whereIn('customer_id', $customerIds)
                ->where('type', 'sale')
                ->whereIn('status', ['sent', 'overdue'])
                ->whereRaw('total_laar > amount_paid_laar')
                ->where('due_date', '<', $today)
                ->groupBy('customer_id')
                ->pluck('cnt', 'customer_id');

        $top = $topCustomers
            ->map(function (Customer $c) use ($eligibility, $overdueCounts): array {
                $availableLaar = $eligibility->availableCreditLaar($c);

                return [
                    'id' => $c->id,
                    'name' => (string) $c->name,
                    'balance_laar' => (int) $c->credit_balance_laar,
                    'balance' => round((int) $c->credit_balance_laar / 100, 2),
                    'limit_laar' => (int) $c->credit_limit_laar,
                    'limit' => round((int) $c->credit_limit_laar / 100, 2),
                    'available_laar' => $availableLaar,
                    'available' => round($availableLaar / 100, 2),
                    'status' => $c->credit_status ?? 'blocked',
                    'credit_enabled' => (bool) $c->credit_enabled,
                    'overdue_invoices_count' => (int) ($overdueCounts[$c->id] ?? 0),
                ];
            })
            ->values()
            ->all();

        return [
            'total_balance_laar' => $totalLaar,
            'total_balance' => round($totalLaar / 100, 2),
            'customers_count' => $customersCount,
            'top_customers' => $top,
        ];
    }

    /**
     * Outstanding customer deposit liability (prepaid balances held).
     *
     * @return array<string, mixed>
     */
    public function depositExposure(): array
    {
        $totalLaar = (int) CustomerDepositAccount::query()
            ->where('balance_laar', '>', 0)
            ->sum('balance_laar');

        $customersCount = (int) CustomerDepositAccount::query()
            ->where('balance_laar', '>', 0)
            ->count();

        $top = CustomerDepositAccount::query()
            ->with('customer:id,name')
            ->where('balance_laar', '>', 0)
            ->orderByDesc('balance_laar')
            ->limit(10)
            ->get()
            ->map(fn (CustomerDepositAccount $a) => [
                'id' => $a->customer_id,
                'name' => (string) ($a->customer?->name ?? 'Customer'),
                'balance_laar' => (int) $a->balance_laar,
                'balance' => round((int) $a->balance_laar / 100, 2),
                'status' => $a->status,
            ])
            ->values()
            ->all();

        return [
            'total_balance_laar' => $totalLaar,
            'total_balance' => round($totalLaar / 100, 2),
            'customers_count' => $customersCount,
            'top_customers' => $top,
        ];
    }

    /**
     * Deposit ledger activity for a date range (not sales).
     *
     * @return array{from: string, to: string, received_laar: int, used_laar: int, payouts_laar: int, transfers_laar: int}
     */
    public function depositActivity(Carbon $from, Carbon $to): array
    {
        $base = CustomerDepositLedger::query()->whereBetween('created_at', [$from, $to]);

        $receivedLaar = (int) (clone $base)->whereIn('type', ['top_up', 'adjustment_add', 'reversal', 'refund'])
            ->selectRaw('COALESCE(SUM(ABS(amount_laar)), 0) as t')->value('t');
        $usedLaar = (int) (clone $base)->where('type', 'usage')
            ->selectRaw('COALESCE(SUM(ABS(amount_laar)), 0) as t')->value('t');
        $payoutsLaar = (int) (clone $base)->where('type', 'payout')
            ->selectRaw('COALESCE(SUM(ABS(amount_laar)), 0) as t')->value('t');
        $transfersLaar = (int) (clone $base)->where('type', 'transfer_to_credit')
            ->selectRaw('COALESCE(SUM(ABS(amount_laar)), 0) as t')->value('t');

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'received_laar' => $receivedLaar,
            'received' => round($receivedLaar / 100, 2),
            'used_laar' => $usedLaar,
            'used' => round($usedLaar / 100, 2),
            'payouts_laar' => $payoutsLaar,
            'payouts' => round($payoutsLaar / 100, 2),
            'transfers_laar' => $transfersLaar,
            'transfers' => round($transfersLaar / 100, 2),
        ];
    }

    /** @var list<string> */
    private const MANAGER_OVERRIDE_ACTIONS = [
        'order.cancelled',
        'shift.force_closed',
        'order.recalled',
        'staff.pin_reset',
        'device.approved',
        'device.rejected',
        'purchase.approved',
        'purchase.rejected',
        'invoice.voided',
    ];

    /**
     * Sensitive staff actions from audit logs (voids, force-closes, approvals).
     *
     * @return array{from: string, to: string, rows: list<array<string, mixed>>}
     */
    public function managerOverrides(Carbon $from, Carbon $to, int $limit = 100): array
    {
        $limit = min(200, max(10, $limit));

        $logs = AuditLog::query()
            ->with('user:id,name')
            ->whereIn('action', self::MANAGER_OVERRIDE_ACTIONS)
            ->whereBetween('created_at', [$from, $to])
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $logs->map(fn (AuditLog $log) => [
                'id' => $log->id,
                'action' => $log->action,
                'user_id' => $log->user_id,
                'user_name' => $log->user?->name ?? 'System',
                'model_type' => $log->model_type,
                'model_id' => $log->model_id,
                'meta' => $log->meta,
                'created_at' => $log->created_at?->toIso8601String(),
            ])->values()->all(),
        ];
    }

    /**
     * Fast vs slow menu item velocity from completed order lines.
     *
     * @return array{from: string, to: string, rows: list<array{item_id: int, item_name: string, qty_sold: int, velocity: string}>}
     */
    public function stockVelocity(Carbon $from, Carbon $to, int $limit = 50): array
    {
        $limit = min(100, max(10, $limit));

        $rows = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', ReportMoneySql::SALE_STATUSES)
            ->whereBetween('orders.created_at', [$from, $to])
            ->whereNotNull('order_items.item_id')
            ->selectRaw('order_items.item_id, order_items.item_name, SUM(order_items.quantity) as qty_sold')
            ->groupBy('order_items.item_id', 'order_items.item_name')
            ->orderByDesc('qty_sold')
            ->limit($limit)
            ->get();

        $quantities = $rows->pluck('qty_sold')->map(fn ($q) => (int) $q)->sort()->values()->all();
        $count = count($quantities);
        $p25 = $count > 0 ? $quantities[(int) floor($count * 0.25)] : 0;
        $p75 = $count > 0 ? $quantities[(int) floor(min($count - 1, $count * 0.75))] : 0;

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $rows->map(function ($row) use ($p25, $p75) {
                $qty = (int) $row->qty_sold;
                $velocity = $qty >= $p75 && $p75 > 0 ? 'fast' : ($qty <= $p25 ? 'slow' : 'normal');

                return [
                    'item_id' => (int) $row->item_id,
                    'item_name' => (string) $row->item_name,
                    'qty_sold' => $qty,
                    'velocity' => $velocity,
                ];
            })->values()->all(),
        ];
    }

    /**
     * Driver cash reconciliation for assigned delivery orders.
     *
     * @return array{from: string, to: string, rows: list<array<string, mixed>>, totals: array<string, mixed>}
     */
    public function driverSettlement(Carbon $from, Carbon $to): array
    {
        $orders = Order::query()
            ->where('type', 'delivery')
            ->whereNotNull('delivery_driver_id')
            ->whereBetween('created_at', [$from, $to])
            ->whereNotIn('status', ['cancelled'])
            ->with(['deliveryDriver:id,name', 'payments'])
            ->get();

        $byDriver = [];
        foreach ($orders as $order) {
            $driverId = (int) $order->delivery_driver_id;
            if (!isset($byDriver[$driverId])) {
                $byDriver[$driverId] = [
                    'driver_id' => $driverId,
                    'driver_name' => $order->deliveryDriver?->name ?? 'Unknown',
                    'orders_count' => 0,
                    'completed_count' => 0,
                    'order_total' => 0.0,
                    'delivery_fees' => 0.0,
                    'cash_collected' => 0.0,
                    'card_collected' => 0.0,
                    'qr_collected' => 0.0,
                    'transfer_collected' => 0.0,
                    'other_collected' => 0.0,
                    'prepaid_count' => 0,
                ];
            }

            $row = &$byDriver[$driverId];
            $row['orders_count']++;
            if ($order->status === 'completed') {
                $row['completed_count']++;
            }
            $row['order_total'] += (float) ($order->total ?? 0);
            $row['delivery_fees'] += (float) ($order->delivery_fee ?? 0);

            $paidPayments = $order->payments
                ->whereIn('status', ['paid', 'completed', 'confirmed'])
                ->where('amount', '>', 0);

            $cash = (float) $paidPayments->where('method', 'cash')->sum('amount');
            $card = (float) $paidPayments->whereIn('method', ['card', 'card_pos'])->sum('amount');
            $qr = (float) $paidPayments->where('method', 'qr')->sum('amount');
            $transfer = (float) $paidPayments->whereIn('method', ['bank_transfer', 'digital_wallet'])->sum('amount');
            $other = (float) $paidPayments
                ->whereNotIn('method', ['cash', 'card', 'card_pos', 'qr', 'bank_transfer', 'digital_wallet'])
                ->sum('amount');
            $row['cash_collected'] += $cash;
            $row['card_collected'] += $card;
            $row['qr_collected'] += $qr;
            $row['transfer_collected'] += $transfer;
            $row['other_collected'] += $other;

            if ($order->payment_status === 'paid' && ($cash + $card + $qr + $transfer + $other) <= 0) {
                $row['prepaid_count']++;
            }
            unset($row);
        }

        $rows = collect($byDriver)
            ->sortByDesc('orders_count')
            ->values()
            ->map(fn (array $row) => [
                ...$row,
                'order_total' => round($row['order_total'], 2),
                'delivery_fees' => round($row['delivery_fees'], 2),
                'cash_collected' => round($row['cash_collected'], 2),
                'card_collected' => round($row['card_collected'], 2),
                'qr_collected' => round($row['qr_collected'], 2),
                'transfer_collected' => round($row['transfer_collected'], 2),
                'other_collected' => round($row['other_collected'], 2),
            ])
            ->all();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $rows,
            'totals' => [
                'orders_count' => (int) collect($rows)->sum('orders_count'),
                'cash_collected' => round((float) collect($rows)->sum('cash_collected'), 2),
                'delivery_fees' => round((float) collect($rows)->sum('delivery_fees'), 2),
            ],
        ];
    }

    /**
     * Closed shifts with cash variance for reconciliation review.
     *
     * @return array{from: string, to: string, rows: list<array<string, mixed>>}
     */
    public function shiftVariances(Carbon $from, Carbon $to): array
    {
        $shifts = Shift::query()
            ->whereNotNull('closed_at')
            ->whereBetween('closed_at', [$from, $to])
            ->with(['user:id,name', 'device:id,name', 'cashCountAttempts'])
            ->orderByDesc('closed_at')
            ->get();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $shifts->map(fn (Shift $s) => [
                'id' => $s->id,
                'user_name' => $s->user?->name ?? '—',
                'device_name' => $s->device?->name ?? '—',
                'opened_at' => $s->opened_at?->toIso8601String(),
                'closed_at' => $s->closed_at?->toIso8601String(),
                'opening_cash' => (float) ($s->opening_cash ?? 0),
                'closing_cash' => $s->closing_cash !== null ? (float) $s->closing_cash : null,
                'expected_cash' => $s->expected_cash !== null ? (float) $s->expected_cash : null,
                'variance' => $s->variance !== null ? (float) $s->variance : null,
                'notes' => $s->notes,
                // Blind-count trail: >1 means the drawer was recounted before close.
                'count_attempts' => $s->cashCountAttempts->count(),
                'first_attempt_variance' => $s->cashCountAttempts->first() !== null
                    ? (float) $s->cashCountAttempts->first()->variance
                    : null,
            ])->values()->all(),
        ];
    }

    /**
     * Top customers by spend in a date range (for reports tab).
     *
     * @return array{from: string, to: string, rows: list<array{id: int, name: string, phone: string|null, order_count: int, total_spent: float, last_order: string|null}>}
     */
    public function customerLtvTop(Carbon $from, Carbon $to, int $limit = 20): array
    {
        $limit = min(50, max(5, $limit));
        $totalLaarExpr = 'COALESCE(o.total_laar, ROUND(o.total * 100))';

        $rows = DB::table('orders as o')
            ->join('customers as c', 'c.id', '=', 'o.customer_id')
            ->whereNotNull('o.customer_id')
            ->whereIn('o.status', ReportMoneySql::SALE_STATUSES)
            ->whereBetween('o.created_at', [$from, $to])
            ->selectRaw('c.id, c.name, c.phone, COUNT(o.id) as order_count')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($totalLaarExpr) . ' as total_spent')
            ->selectRaw('MAX(o.created_at) as last_order')
            ->groupBy('c.id', 'c.name', 'c.phone')
            ->orderByRaw('SUM(' . $totalLaarExpr . ') DESC')
            ->limit($limit)
            ->get();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $rows->map(fn ($r) => [
                'id' => (int) $r->id,
                'name' => (string) $r->name,
                'phone' => $r->phone,
                'order_count' => (int) $r->order_count,
                'total_spent' => round((float) $r->total_spent, 2),
                'last_order' => $r->last_order,
            ])->values()->all(),
        ];
    }

    /**
     * Cashier / staff sales performance for completed orders.
     *
     * @return array{from: string, to: string, rows: list<array<string, mixed>>}
     */
    public function cashierPerformance(Carbon $from, Carbon $to): array
    {
        $totalLaarExpr = ReportMoneySql::ORDER_TOTAL_LAAR;

        $sales = Order::query()
            ->leftJoin('users', 'users.id', '=', 'orders.user_id')
            ->whereBetween('orders.created_at', [$from, $to])
            ->whereIn('orders.status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw('orders.user_id, users.name, COUNT(*) as orders_count')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($totalLaarExpr) . ' as total')
            ->selectRaw('ROUND(COALESCE(AVG(' . $totalLaarExpr . '), 0) / 100.0, 2) as avg_order')
            ->groupBy('orders.user_id', 'users.name')
            ->get()
            ->keyBy('user_id');

        $voids = AuditLog::query()
            ->where('action', 'order.cancelled')
            ->whereBetween('created_at', [$from, $to])
            ->select('user_id', DB::raw('COUNT(*) as voids_count'))
            ->groupBy('user_id')
            ->pluck('voids_count', 'user_id');

        $rows = $sales->map(function ($row) use ($voids) {
            $userId = $row->user_id !== null ? (int) $row->user_id : null;
            $ordersCount = (int) $row->orders_count;
            $total = (float) $row->total;

            return [
                'user_id' => $userId,
                'name' => $row->name ?? 'Unassigned',
                'orders_count' => $ordersCount,
                'total' => round($total, 2),
                'avg_order' => round((float) $row->avg_order, 2),
                'voids_count' => (int) ($voids[$row->user_id] ?? 0),
            ];
        })->sortByDesc('total')->values()->all();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $rows,
        ];
    }

    /**
     * Menu item margin snapshot using configured cost vs base price.
     *
     * @return array{rows: list<array{item_id: int, name: string, price: float, cost: float|null, margin_pct: float|null, category: string|null}>}
     */
    public function productMargins(int $limit = 100): array
    {
        $limit = min(200, max(10, $limit));
        $recipeCosts = app(RecipeCostCalculator::class);

        $rows = Item::query()
            // Variants are the price this report shows for a sized dish, so
            // they have to be the cost as well — see below.
            ->with(['category:id,name', 'recipe.recipeItems.inventoryItem', 'variants'])
            ->where('is_available', true)
            ->orderBy('name')
            ->limit($limit)
            ->get(['id', 'name', 'base_price', 'cost', 'category_id', 'has_variants']);

        return [
            'rows' => $rows->map(function (Item $item) use ($recipeCosts) {
                // displayPrice() is the cheapest active size on a sized dish,
                // so cost that same size. Pairing it with the whole recipe made
                // half portions read as far worse business than they are.
                $variant = $item->has_variants
                    ? $item->variants->where('is_active', true)->sortBy('price')->first()
                    : null;
                $price = $item->displayPrice();
                $cost = $recipeCosts->effectiveCostForVariant($item, $variant);
                $marginPct = ($cost !== null && $price > 0)
                    ? round((($price - $cost) / $price) * 100, 1)
                    : null;

                return [
                    'item_id' => $item->id,
                    'name' => (string) $item->name
                        . ($variant !== null ? ' — ' . $variant->name : ''),
                    'price' => round($price, 2),
                    'cost' => $cost !== null ? round($cost, 2) : null,
                    'margin_pct' => $marginPct,
                    'category' => $item->category?->name,
                ];
            })->sortByDesc(fn (array $row) => $row['margin_pct'] ?? -999)->values()->all(),
        ];
    }

    /**
     * Orders and revenue by hour-of-day for a date range.
     *
     * @return array{from: string, to: string, hours: list<array{hour: int, label: string, count: int, revenue: float, avg_total: float}>}
     */
    public function hourlySales(Carbon $from, Carbon $to): array
    {
        $hourExpr = match (DB::getDriverName()) {
            'sqlite' => "CAST(strftime('%H', created_at) AS INTEGER)",
            'pgsql' => 'EXTRACT(HOUR FROM created_at)::INTEGER',
            default => 'HOUR(created_at)',
        };

        $totalLaarExpr = ReportMoneySql::ORDER_TOTAL_LAAR;

        $rows = DB::table('orders')
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw("{$hourExpr} as hour, COUNT(*) as count")
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($totalLaarExpr) . ' as revenue')
            ->selectRaw('ROUND(COALESCE(AVG(' . $totalLaarExpr . '), 0) / 100.0, 2) as avg_total')
            ->groupByRaw($hourExpr)
            ->orderBy('hour')
            ->get();

        $hours = [];
        for ($h = 0; $h < 24; $h++) {
            $row = $rows->firstWhere('hour', $h);
            $hours[] = [
                'hour' => $h,
                'label' => sprintf('%02d:00', $h),
                'count' => $row ? (int) $row->count : 0,
                'revenue' => $row ? round((float) $row->revenue, 2) : 0,
                'avg_total' => $row ? round((float) $row->avg_total, 2) : 0,
            ];
        }

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'hours' => $hours,
        ];
    }

    /**
     * Kitchen station (menu group) performance from completed order lines.
     *
     * @return array{from: string, to: string, rows: list<array{menu_group_id: int|null, station: string, line_count: int, qty: int, revenue: float}>}
     */
    public function stationPerformance(Carbon $from, Carbon $to): array
    {
        $rows = DB::table('order_items as oi')
            ->join('orders as o', 'o.id', '=', 'oi.order_id')
            ->leftJoin('items as i', 'i.id', '=', 'oi.item_id')
            ->leftJoin('menu_groups as mg', 'mg.id', '=', 'i.menu_group_id')
            ->whereBetween('o.created_at', [$from, $to])
            ->whereIn('o.status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw('i.menu_group_id, COALESCE(mg.name, \'Unassigned\') as station, COUNT(oi.id) as line_count, COALESCE(SUM(oi.quantity),0) as qty, COALESCE(SUM(oi.total_price),0) as revenue')
            ->groupBy('i.menu_group_id', 'mg.name')
            ->orderByDesc('revenue')
            ->get();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $rows->map(fn ($r) => [
                'menu_group_id' => $r->menu_group_id !== null ? (int) $r->menu_group_id : null,
                'station' => (string) $r->station,
                'line_count' => (int) $r->line_count,
                'qty' => (int) $r->qty,
                'revenue' => round((float) $r->revenue, 2),
            ])->values()->all(),
        ];
    }

    /**
     * Stock anomalies: negative inventory, sold-out-but-listed, below threshold.
     *
     * @return array{rows: list<array{type: string, id: int, name: string, detail: string}>}
     */
    public function stockDiscrepancy(): array
    {
        $rows = [];

        InventoryItem::query()
            ->where('is_active', true)
            ->where('current_stock', '<', 0)
            ->orderBy('name')
            ->get(['id', 'name', 'current_stock', 'sku'])
            ->each(function (InventoryItem $sku) use (&$rows): void {
                $rows[] = [
                    'type' => 'inventory_negative',
                    'id' => $sku->id,
                    'name' => (string) $sku->name,
                    'detail' => 'SKU ' . ($sku->sku ?: $sku->id) . ' on hand ' . $sku->current_stock,
                ];
            });

        Item::query()
            ->where('track_stock', true)
            ->where('availability_type', 'stock_based')
            ->where('is_available', true)
            ->where('stock_quantity', '<=', 0)
            ->orderBy('name')
            ->get(['id', 'name', 'stock_quantity'])
            ->each(function (Item $item) use (&$rows): void {
                $rows[] = [
                    'type' => 'menu_sold_out_listed',
                    'id' => $item->id,
                    'name' => (string) $item->name,
                    'detail' => 'Listed available but stock is ' . $item->stock_quantity,
                ];
            });

        Item::query()
            ->where('track_stock', true)
            ->where('availability_type', 'stock_based')
            ->whereColumn('stock_quantity', '<=', 'low_stock_threshold')
            ->where('stock_quantity', '>', 0)
            ->orderBy('stock_quantity')
            ->limit(50)
            ->get(['id', 'name', 'stock_quantity', 'low_stock_threshold'])
            ->each(function (Item $item) use (&$rows): void {
                $rows[] = [
                    'type' => 'menu_low_stock',
                    'id' => $item->id,
                    'name' => (string) $item->name,
                    'detail' => "Stock {$item->stock_quantity} (threshold {$item->low_stock_threshold})",
                ];
            });

        return ['rows' => $rows];
    }

    /**
     * New vs returning customers grouped by first-order month.
     *
     * @return array{from: string, to: string, cohorts: list<array{cohort_month: string, new_customers: int, repeat_customers: int, repeat_rate: float}>}
     */
    public function customerCohorts(Carbon $from, Carbon $to): array
    {
        $firstByCustomer = Order::query()
            ->whereNotNull('customer_id')
            ->whereIn('status', ['completed', 'delivered'])
            ->where('payment_status', 'paid')
            ->selectRaw('customer_id, MIN(created_at) as first_order_at')
            ->groupBy('customer_id')
            ->havingRaw('MIN(created_at) BETWEEN ? AND ?', [$from, $to])
            ->get()
            ->keyBy('customer_id');

        if ($firstByCustomer->isEmpty()) {
            return [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'cohorts' => [],
            ];
        }

        $repeatCounts = Order::query()
            ->whereIn('customer_id', $firstByCustomer->keys())
            ->whereIn('status', ['completed', 'delivered'])
            ->where('payment_status', 'paid')
            ->selectRaw('customer_id, COUNT(*) as order_count')
            ->groupBy('customer_id')
            ->pluck('order_count', 'customer_id');

        $byMonth = [];
        foreach ($firstByCustomer as $customerId => $row) {
            $month = Carbon::parse($row->first_order_at)->format('Y-m');
            if (!isset($byMonth[$month])) {
                $byMonth[$month] = [
                    'cohort_month' => $month,
                    'new_customers' => 0,
                    'repeat_customers' => 0,
                ];
            }
            $byMonth[$month]['new_customers']++;
            if ((int) ($repeatCounts[$customerId] ?? 0) > 1) {
                $byMonth[$month]['repeat_customers']++;
            }
        }

        $cohorts = collect($byMonth)
            ->map(function (array $row): array {
                $row['repeat_rate'] = $row['new_customers'] > 0
                    ? round(($row['repeat_customers'] / $row['new_customers']) * 100, 1)
                    : 0.0;

                return $row;
            })
            ->sortBy('cohort_month')
            ->values()
            ->all();

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'cohorts' => $cohorts,
        ];
    }

    /**
     * Spend by inventory item from received purchase lines in a date range.
     * Used for cheapest-shop / purchase spend analysis (not opex Expenses).
     *
     * @return array{
     *     from: string,
     *     to: string,
     *     totals: array{items_count: int, qty_received: float, total_spend: float},
     *     rows: list<array{
     *         inventory_item_id: int,
     *         item_name: string,
     *         unit: string|null,
     *         qty_received: float,
     *         total_spend: float,
     *         avg_unit_cost: float,
     *         last_unit_cost: float,
     *         last_supplier: string|null,
     *         cheapest_unit_cost: float|null,
     *         cheapest_supplier: string|null,
     *         receipts_count: int
     *     }>
     * }
     */
    public function spendByItem(Carbon $from, Carbon $to): array
    {
        $fromDate = $from->toDateString();
        $toDate = $to->toDateString();

        $lines = PurchaseItem::query()
            ->with([
                'inventoryItem:id,name,unit',
                'purchase:id,supplier_id,purchase_date,actual_delivery_date,status',
                'purchase.supplier:id,name',
            ])
            ->whereNotNull('inventory_item_id')
            ->where('received_quantity', '>', 0)
            ->whereHas('purchase', function ($q) use ($fromDate, $toDate) {
                $q->whereIn('status', ['received', 'partial'])
                    // DATE() keeps timezone-safe comparison for date columns across drivers.
                    ->whereRaw(
                        'DATE(COALESCE(actual_delivery_date, purchase_date)) BETWEEN ? AND ?',
                        [$fromDate, $toDate],
                    );
            })
            ->get();

        /** @var array<int, array<string, mixed>> $byItem */
        $byItem = [];

        foreach ($lines as $line) {
            $itemId = (int) $line->inventory_item_id;
            $qty = (float) $line->received_quantity;
            $unitCost = (float) $line->unit_cost;
            $spend = round($qty * $unitCost, 2);
            $supplierName = $line->purchase?->supplier?->name;
            $eventDate = (string) (
                $line->purchase?->actual_delivery_date?->toDateString()
                ?? $line->purchase?->purchase_date?->toDateString()
                ?? ''
            );

            if (!isset($byItem[$itemId])) {
                $byItem[$itemId] = [
                    'inventory_item_id' => $itemId,
                    'item_name' => $line->inventoryItem?->name ?? ('Item #' . $itemId),
                    'unit' => $line->inventoryItem?->unit,
                    'qty_received' => 0.0,
                    'total_spend' => 0.0,
                    'receipts_count' => 0,
                    'last_unit_cost' => $unitCost,
                    'last_supplier' => $supplierName,
                    'last_date' => $eventDate,
                    'cheapest_unit_cost' => $unitCost,
                    'cheapest_supplier' => $supplierName,
                ];
            }

            $row = &$byItem[$itemId];
            $row['qty_received'] += $qty;
            $row['total_spend'] += $spend;
            $row['receipts_count']++;

            if ($eventDate >= ($row['last_date'] ?? '')) {
                $row['last_date'] = $eventDate;
                $row['last_unit_cost'] = $unitCost;
                $row['last_supplier'] = $supplierName;
            }
            if ($unitCost < (float) $row['cheapest_unit_cost']) {
                $row['cheapest_unit_cost'] = $unitCost;
                $row['cheapest_supplier'] = $supplierName;
            }
            unset($row);
        }

        // Enrich cheapest from price history in the same window (covers create-as-received + receive paths).
        $itemIds = array_keys($byItem);
        if ($itemIds !== []) {
            $history = SupplierPriceHistory::query()
                ->with('supplier:id,name')
                ->whereIn('inventory_item_id', $itemIds)
                ->whereBetween('recorded_at', [$fromDate, $toDate])
                ->orderBy('unit_price')
                ->get()
                ->groupBy('inventory_item_id');

            foreach ($history as $itemId => $rows) {
                $best = $rows->first();
                if (!$best || !isset($byItem[(int) $itemId])) {
                    continue;
                }
                $histPrice = (float) $best->unit_price;
                if ($histPrice < (float) $byItem[(int) $itemId]['cheapest_unit_cost']) {
                    $byItem[(int) $itemId]['cheapest_unit_cost'] = $histPrice;
                    $byItem[(int) $itemId]['cheapest_supplier'] = $best->supplier?->name;
                }
            }
        }

        $rows = collect($byItem)
            ->map(function (array $row): array {
                $qty = (float) $row['qty_received'];
                $spend = round((float) $row['total_spend'], 2);

                return [
                    'inventory_item_id' => $row['inventory_item_id'],
                    'item_name' => $row['item_name'],
                    'unit' => $row['unit'],
                    'qty_received' => round($qty, 3),
                    'total_spend' => $spend,
                    'avg_unit_cost' => $qty > 0 ? round($spend / $qty, 4) : 0.0,
                    'last_unit_cost' => round((float) $row['last_unit_cost'], 4),
                    'last_supplier' => $row['last_supplier'],
                    'cheapest_unit_cost' => isset($row['cheapest_unit_cost'])
                        ? round((float) $row['cheapest_unit_cost'], 4)
                        : null,
                    'cheapest_supplier' => $row['cheapest_supplier'],
                    'receipts_count' => (int) $row['receipts_count'],
                ];
            })
            ->sortByDesc('total_spend')
            ->values()
            ->all();

        return [
            'from' => $fromDate,
            'to' => $toDate,
            'totals' => [
                'items_count' => count($rows),
                'qty_received' => round(collect($rows)->sum('qty_received'), 3),
                'total_spend' => round(collect($rows)->sum('total_spend'), 2),
            ],
            'rows' => $rows,
        ];
    }
}
