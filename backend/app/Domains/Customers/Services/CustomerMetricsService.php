<?php

declare(strict_types=1);

namespace App\Domains\Customers\Services;

use App\Domains\Customers\Support\CustomerPaidOrderQuery;
use App\Models\Customer;
use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

final class CustomerMetricsService
{
    public const VIP_MIN_SPEND_MVR = 5000;

    public function dashboard(): array
    {
        $now = now();
        $metrics = [
            'total_customers' => Customer::count(),
            'new_customers_today' => Customer::whereDate('created_at', $now->toDateString())->count(),
            'new_customers_7d' => Customer::where('created_at', '>=', $now->copy()->subDays(7))->count(),
            'new_customers_30d' => Customer::where('created_at', '>=', $now->copy()->subDays(30))->count(),
            'active_customers_30d' => $this->activeCustomersCount(30),
            'active_customers_90d' => $this->activeCustomersCount(90),
            'customers_with_paid_orders' => $this->customersWithPaidOrdersCount(),
            'returning_customers' => $this->returningCustomersCount(),
            'total_paid_orders' => $this->paidOrdersBase()->count(),
            'total_paid_revenue' => round((float) $this->paidOrdersBase()->sum('total'), 2),
            'sms_opt_in_count' => Customer::where(fn ($q) => $q->where('sms_opt_out', false)->orWhereNull('sms_opt_out'))->count(),
            'sms_opt_out_count' => Customer::where('sms_opt_out', true)->count(),
            'incomplete_profile_count' => Customer::where(function ($q): void {
                $q->where('is_profile_complete', false)->orWhereNull('name')->orWhere('name', '');
            })->count(),
            'approved_credit_customers' => Customer::where('credit_enabled', true)->count(),
            'total_credit_balance' => (int) Customer::where('credit_enabled', true)->sum('credit_balance_laar'),
            'overdue_credit_customers' => $this->overdueCreditCustomersCount(),
        ];

        $withPaid = max(1, (int) $metrics['customers_with_paid_orders']);
        $metrics['repeat_rate'] = round(($metrics['returning_customers'] / $withPaid) * 100, 1);
        $metrics['average_order_value'] = $metrics['total_paid_orders'] > 0
            ? round($metrics['total_paid_revenue'] / $metrics['total_paid_orders'], 2)
            : 0.0;
        $metrics['average_lifetime_value'] = round($metrics['total_paid_revenue'] / $withPaid, 2);
        $metrics['dormant_30d'] = $this->dormantCount(30);
        $metrics['dormant_60d'] = $this->dormantCount(60);
        $metrics['dormant_90d'] = $this->dormantCount(90);
        $metrics['trends'] = $this->weeklyTrends(12);

        return $metrics;
    }

    /** @return list<array{week: string, new_customers: int, returning_order_customers: int, repeat_rate: float}> */
    public function weeklyTrends(int $weeks = 12): array
    {
        $weeks = min(max(1, $weeks), 52);
        $rangeStart = Carbon::now()->startOfWeek()->subWeeks($weeks - 1);
        $rangeEnd = Carbon::now()->endOfWeek();

        $paidOrders = CustomerPaidOrderQuery::base()
            ->whereBetween('paid_at', [$rangeStart, $rangeEnd])
            ->whereNotNull('customer_id')
            ->select('customer_id', 'paid_at')
            ->get();

        $firstPaidByCustomer = CustomerPaidOrderQuery::base()
            ->whereNotNull('customer_id')
            ->select('customer_id', DB::raw('MIN(paid_at) as first_paid_at'))
            ->groupBy('customer_id')
            ->pluck('first_paid_at', 'customer_id');

        $newByWeek = Customer::query()
            ->whereBetween('created_at', [$rangeStart, $rangeEnd])
            ->select('created_at')
            ->get()
            ->groupBy(fn ($c) => Carbon::parse($c->created_at)->startOfWeek()->toDateString());

        $rows = [];
        for ($i = 0; $i < $weeks; $i++) {
            $weekStart = $rangeStart->copy()->addWeeks($i);
            $weekEnd = $weekStart->copy()->endOfWeek();
            $weekKey = $weekStart->toDateString();

            $ordersInWeek = $paidOrders->filter(
                fn ($o) => Carbon::parse($o->paid_at)->between($weekStart, $weekEnd),
            );

            $customerIds = $ordersInWeek->pluck('customer_id')->unique();
            $returning = $customerIds->filter(function ($cid) use ($firstPaidByCustomer, $weekStart): bool {
                $first = $firstPaidByCustomer->get($cid);
                if (!$first) {
                    return false;
                }

                return Carbon::parse($first)->lt($weekStart);
            })->count();

            $newCustomers = ($newByWeek->get($weekKey) ?? collect())->count();
            $activeCount = $customerIds->count();
            $repeatRate = $activeCount > 0 ? round(($returning / $activeCount) * 100, 1) : 0.0;

            $rows[] = [
                'week' => $weekStart->format('Y-m-d'),
                'new_customers' => $newCustomers,
                'returning_order_customers' => $returning,
                'repeat_rate' => $repeatRate,
            ];
        }

        return $rows;
    }

    private function paidOrdersBase()
    {
        return CustomerPaidOrderQuery::base();
    }

    private function activeCustomersCount(int $days): int
    {
        return (int) CustomerPaidOrderQuery::base()
            ->where('paid_at', '>=', now()->subDays($days))
            ->distinct('customer_id')
            ->count('customer_id');
    }

    private function customersWithPaidOrdersCount(): int
    {
        return (int) CustomerPaidOrderQuery::base()
            ->distinct('customer_id')
            ->count('customer_id');
    }

    private function returningCustomersCount(): int
    {
        return (int) CustomerPaidOrderQuery::base()
            ->select('customer_id')
            ->groupBy('customer_id')
            ->havingRaw('COUNT(*) >= 2')
            ->get()
            ->count();
    }

    private function dormantCount(int $days): int
    {
        $cutoff = now()->subDays($days);

        return (int) DB::table('customers as c')
            ->joinSub(
                CustomerPaidOrderQuery::base()
                    ->select('customer_id', DB::raw('MAX(paid_at) as last_paid_at'))
                    ->groupBy('customer_id'),
                'po',
                'po.customer_id',
                '=',
                'c.id',
            )
            ->whereNull('c.deleted_at')
            ->where('po.last_paid_at', '<', $cutoff)
            ->count();
    }

    private function overdueCreditCustomersCount(): int
    {
        return (int) Invoice::query()
            ->where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereColumn('total_laar', '>', 'amount_paid_laar')
            ->whereNotNull('customer_id')
            ->distinct('customer_id')
            ->count('customer_id');
    }
}
