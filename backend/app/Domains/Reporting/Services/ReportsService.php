<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Shift;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * All reporting aggregate queries in one place.
 * The ReportsController is a thin HTTP layer that calls these methods.
 * Swap the underlying queries here without touching routing or HTTP concerns.
 */
class ReportsService
{
    /**
     * Sales summary totals and payment breakdown for a date range.
     */
    public function salesSummary(Carbon $from, Carbon $to, ?int $userId = null, ?int $shiftId = null, ?int $deviceId = null): array
    {
        $orderBase = Order::query()
            ->whereBetween('created_at', [$from, $to])
            ->where('status', 'completed')
            ->when($userId, fn ($q) => $q->where('user_id', $userId))
            ->when($shiftId, fn ($q) => $q->where('shift_id', $shiftId))
            ->when($deviceId, fn ($q) => $q->where('device_id', $deviceId));

        $agg = (clone $orderBase)
            ->selectRaw('COUNT(*) as orders_count, COALESCE(SUM(subtotal),0) as subtotal, COALESCE(SUM(tax_amount),0) as tax_amount, COALESCE(SUM(discount_amount),0) as discount_amount, COALESCE(SUM(service_charge_amount),0) as service_charge_total, COALESCE(SUM(delivery_fee),0) as delivery_fee_total, COALESCE(SUM(total),0) as total')
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
        $payments = Payment::query()
            ->whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->whereHas('order', function ($oq) use ($from, $to, $userId, $shiftId, $deviceId) {
                $oq->where('status', 'completed')
                    ->whereBetween('created_at', [$from, $to])
                    ->when($userId, fn ($q2) => $q2->where('user_id', $userId))
                    ->when($shiftId, fn ($q2) => $q2->where('shift_id', $shiftId))
                    ->when($deviceId, fn ($q2) => $q2->where('device_id', $deviceId));
            })
            ->select('method', DB::raw('SUM(amount) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'filters' => array_filter([
                'user_id' => $userId,
                'shift_id' => $shiftId,
                'device_id' => $deviceId,
            ]),
            'totals' => $totals,
            'payments' => $payments,
        ];
    }

    /**
     * Sales breakdown by item, category, and employee for a date range.
     */
    public function salesBreakdown(Carbon $from, Carbon $to, int $limit = 100): array
    {
        $items = OrderItem::select(
            'item_id',
            'item_name',
            DB::raw('SUM(quantity) as quantity'),
            DB::raw('SUM(total_price) as total'),
        )
            ->whereHas('order', fn ($q) => $q->whereBetween('created_at', [$from, $to])->where('status', 'completed'))
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
            ->whereHas('order', fn ($q) => $q->whereBetween('created_at', [$from, $to])->where('status', 'completed'))
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('total')
            ->limit(50)
            ->get();

        $employees = Order::leftJoin('users', 'users.id', '=', 'orders.user_id')
            ->select('orders.user_id', 'users.name', DB::raw('COUNT(*) as orders_count'), DB::raw('SUM(orders.total) as total'))
            ->whereBetween('orders.created_at', [$from, $to])
            ->where('orders.status', 'completed')
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
        ];
    }

    /**
     * X-Report: mid-shift totals for the currently open shift of the given user.
     * Returns null if no active shift exists.
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
            ->where('status', 'completed')
            ->selectRaw('COUNT(*) as orders_count, COALESCE(SUM(subtotal),0) as subtotal, COALESCE(SUM(tax_amount),0) as tax_amount, COALESCE(SUM(discount_amount),0) as discount_amount, COALESCE(SUM(service_charge_amount),0) as service_charge_total, COALESCE(SUM(total),0) as total')
            ->first();

        $totals = [
            'orders_count' => (int) ($agg->orders_count ?? 0),
            'subtotal' => (float) ($agg->subtotal ?? 0),
            'tax_amount' => (float) ($agg->tax_amount ?? 0),
            'discount_amount' => (float) ($agg->discount_amount ?? 0),
            'service_charge_total' => (float) ($agg->service_charge_total ?? 0),
            'total' => (float) ($agg->total ?? 0),
        ];

        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->whereHas('order', fn ($q) => $q->where('user_id', $shift->user_id))
            ->select('method', DB::raw('SUM(amount) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

        $refundsTotal = Refund::whereBetween('created_at', [$from, $to])
            ->whereHas('order', fn ($q) => $q->where('user_id', $shift->user_id))
            ->sum('amount');

        return [
            'shift' => $shift,
            'from' => $from->toDateTimeString(),
            'to' => $to->toDateTimeString(),
            'totals' => $totals,
            'payments' => $payments,
            'refunds' => $refundsTotal,
        ];
    }

    /**
     * Z-Report: end-of-day totals for a date range.
     */
    public function zReport(Carbon $from, Carbon $to): array
    {
        $agg = Order::whereBetween('created_at', [$from, $to])
            ->where('status', 'completed')
            ->selectRaw('COUNT(*) as orders_count, COALESCE(SUM(subtotal),0) as subtotal, COALESCE(SUM(tax_amount),0) as tax_amount, COALESCE(SUM(discount_amount),0) as discount_amount, COALESCE(SUM(service_charge_amount),0) as service_charge_total, COALESCE(SUM(total),0) as total')
            ->first();

        $totals = [
            'orders_count' => (int) ($agg->orders_count ?? 0),
            'subtotal' => (float) ($agg->subtotal ?? 0),
            'tax_amount' => (float) ($agg->tax_amount ?? 0),
            'discount_amount' => (float) ($agg->discount_amount ?? 0),
            'service_charge_total' => (float) ($agg->service_charge_total ?? 0),
            'total' => (float) ($agg->total ?? 0),
        ];

        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->select('method', DB::raw('SUM(amount) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

        $refunds = Refund::whereBetween('created_at', [$from, $to])->sum('amount');

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => $totals,
            'payments' => $payments,
            'refunds' => $refunds,
        ];
    }

    /**
     * Inventory valuation — total stock value and quantity across all items.
     */
    public function inventoryValuation(): array
    {
        $totals = InventoryItem::select(
            DB::raw('SUM(COALESCE(current_stock, 0) * COALESCE(unit_cost, 0)) as value'),
            DB::raw('SUM(COALESCE(current_stock, 0)) as quantity'),
        )->first();

        return [
            'value' => (float) ($totals->value ?? 0),
            'quantity' => (float) ($totals->quantity ?? 0),
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
        $rows = Order::query()
            ->where('type', 'delivery')
            ->where('status', 'completed')
            ->whereBetween('created_at', [$from, $to])
            ->whereNotNull('delivery_island')
            ->where('delivery_island', '!=', '')
            ->selectRaw('delivery_island as zone, COUNT(*) as orders_count, COALESCE(SUM(total),0) as order_total, COALESCE(SUM(delivery_fee),0) as fees_total, COALESCE(AVG(delivery_fee),0) as avg_fee')
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
        $base = Order::query()
            ->whereBetween('created_at', [$from, $to])
            ->where('status', 'completed');

        $types = [
            'promo' => 'promo_discount_laar',
            'loyalty' => 'loyalty_discount_laar',
            'manual' => 'manual_discount_laar',
            'gift_card' => 'gift_card_discount_laar',
            'referral' => 'referral_discount_laar',
        ];

        $rows = [];
        foreach ($types as $label => $column) {
            $sumLaar = (int) (clone $base)->sum($column);
            $ordersCount = (int) (clone $base)->where($column, '>', 0)->count();
            $rows[] = [
                'type' => $label,
                'amount_laar' => $sumLaar,
                'amount' => round($sumLaar / 100, 2),
                'orders_count' => $ordersCount,
            ];
        }

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'rows' => $rows,
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
        $totalLaar = (int) Customer::query()
            ->where('credit_enabled', true)
            ->where('credit_balance_laar', '>', 0)
            ->sum('credit_balance_laar');

        $customersCount = (int) Customer::query()
            ->where('credit_enabled', true)
            ->where('credit_balance_laar', '>', 0)
            ->count();

        $top = Customer::query()
            ->where('credit_enabled', true)
            ->where('credit_balance_laar', '>', 0)
            ->orderByDesc('credit_balance_laar')
            ->limit(10)
            ->get(['id', 'name', 'credit_balance_laar'])
            ->map(fn (Customer $c) => [
                'id' => $c->id,
                'name' => (string) $c->name,
                'balance_laar' => (int) $c->credit_balance_laar,
                'balance' => round((int) $c->credit_balance_laar / 100, 2),
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
            ->where('orders.status', 'completed')
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
            $card = (float) $paidPayments->whereNotIn('method', ['cash'])->sum('amount');
            $row['cash_collected'] += $cash;
            $row['card_collected'] += $card;

            if ($order->payment_status === 'paid' && $cash <= 0 && $card <= 0) {
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
            ->with(['user:id,name', 'device:id,name'])
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
            ])->values()->all(),
        ];
    }

    /**
     * Top customers by lifetime spend (for reports tab).
     *
     * @return array{rows: list<array{id: int, name: string, phone: string|null, order_count: int, total_spent: float, last_order: string|null}>}
     */
    public function customerLtvTop(int $limit = 20): array
    {
        $limit = min(50, max(5, $limit));

        $rows = DB::table('orders as o')
            ->join('customers as c', 'c.id', '=', 'o.customer_id')
            ->whereNotNull('o.customer_id')
            ->whereNotIn('o.status', ['cancelled'])
            ->selectRaw('c.id, c.name, c.phone, COUNT(o.id) as order_count, SUM(o.total) as total_spent, MAX(o.created_at) as last_order')
            ->groupBy('c.id', 'c.name', 'c.phone')
            ->orderByRaw('SUM(o.total) DESC')
            ->limit($limit)
            ->get();

        return [
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
}
