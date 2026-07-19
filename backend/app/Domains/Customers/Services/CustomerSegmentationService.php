<?php

declare(strict_types=1);

namespace App\Domains\Customers\Services;

use App\Domains\Customers\Support\CustomerPaidOrderQuery;
use App\Models\Customer;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class CustomerSegmentationService
{
    /** @deprecated Use VipSettingsService::DEFAULT_MIN_SPEND_MVR */
    public const VIP_MIN_SPEND_MVR = VipSettingsService::DEFAULT_MIN_SPEND_MVR;

    /** @var array<string, string> */
    public const SEGMENTS = [
        'new_customers' => 'New customers (30d)',
        'no_order_yet' => 'No paid orders yet',
        'first_time_buyers' => 'First-time buyers',
        'repeat_customers' => 'Repeat customers',
        'vip_customers' => 'VIP customers',
        'dormant_30d' => 'Dormant 30+ days',
        'dormant_60d' => 'Dormant 60+ days',
        'dormant_90d' => 'Dormant 90+ days',
        'sms_opt_in' => 'SMS opt-in',
        'sms_opt_out' => 'SMS opt-out',
        'incomplete_profile' => 'Incomplete profile',
        'credit_approved' => 'Credit approved',
        'credit_with_balance' => 'Credit with balance',
        'referral_customers' => 'Referral customers',
        'review_customers' => 'Left a review',
    ];

    public function __construct(
        private readonly VipSettingsService $vipSettings,
    ) {}

    /** @return list<array{slug: string, label: string, count: int}> */
    public function listSegments(): array
    {
        return collect(self::SEGMENTS)->map(function (string $label, string $slug): array {
            return [
                'slug' => $slug,
                'label' => $slug === 'vip_customers' ? $this->vipSettings->segmentLabel() : $label,
                'count' => $this->segmentCount($slug),
            ];
        })->values()->all();
    }

    public function customerIsVip(Customer $customer): bool
    {
        return $this->isVip($this->paidStatsForCustomer($customer->id));
    }

    /** @return \Illuminate\Support\Collection<int, int> */
    public function customerIdsInSegment(string $slug): \Illuminate\Support\Collection
    {
        if (!isset(self::SEGMENTS[$slug])) {
            throw new InvalidArgumentException("Unknown segment: {$slug}");
        }

        $query = Customer::query();
        $this->ensurePaidStatsJoin($query);
        $this->applySegmentFilter($query, $slug);

        return $query->pluck('customers.id')->map(fn ($id) => (int) $id)->values();
    }

    /** @param array{search?: string, page?: int, per_page?: int} $filters */
    public function customersInSegment(string $slug, array $filters = []): LengthAwarePaginator
    {
        if (!isset(self::SEGMENTS[$slug])) {
            throw new InvalidArgumentException("Unknown segment: {$slug}");
        }

        $query = $this->baseCustomerQuery();
        $this->applySegmentFilter($query, $slug);

        if (!empty($filters['search'])) {
            $like = '%' . $filters['search'] . '%';
            $query->where(function ($q) use ($like): void {
                $q->where('customers.name', 'like', $like)
                    ->orWhere('customers.phone', 'like', $like)
                    ->orWhere('customers.email', 'like', $like);
            });
        }

        $perPage = min(max((int) ($filters['per_page'] ?? 30), 1), 100);
        $page = max((int) ($filters['page'] ?? 1), 1);

        $paginator = $query
            ->orderByDesc('po.last_paid_at')
            ->orderByDesc('customers.created_at')
            ->paginate($perPage, ['customers.*'], 'page', $page);

        $paginator->getCollection()->transform(fn (Customer $c) => $this->formatSegmentRow($c));

        return $paginator;
    }

    public function segmentCount(string $slug): int
    {
        if (!isset(self::SEGMENTS[$slug])) {
            return 0;
        }

        $query = Customer::query();
        $this->ensurePaidStatsJoin($query);
        $this->applySegmentFilter($query, $slug);

        return (int) $query->count('customers.id');
    }

    /** @return list<string> */
    public function badgesForCustomer(Customer $customer): array
    {
        $badges = [];
        $stats = $this->paidStatsForCustomer($customer->id);

        if ($customer->created_at && $customer->created_at->gte(now()->subDays(30))) {
            $badges[] = 'new';
        }
        if ((int) ($stats->orders_count_paid ?? 0) >= 2) {
            $badges[] = 'returning';
        }
        if ($this->isVip($stats)) {
            $badges[] = 'vip';
        }
        if ($this->isDormant($stats, 30)) {
            $badges[] = 'dormant';
        }
        if ($customer->credit_enabled) {
            $badges[] = 'credit';
        }
        if ($customer->sms_opt_out) {
            $badges[] = 'sms_off';
        }
        if (!$customer->is_profile_complete || !$customer->name) {
            $badges[] = 'incomplete';
        }

        return $badges;
    }

    private function baseCustomerQuery(): Builder
    {
        $query = Customer::query()->select('customers.*');
        $this->ensurePaidStatsJoin($query);

        return $query
            ->selectRaw('COALESCE(po.orders_count_paid, 0) as orders_count_paid')
            ->selectRaw('COALESCE(po.total_paid_spend, 0) as total_paid_spend')
            ->selectRaw('po.last_paid_at as last_paid_at')
            ->with(['tags', 'loyaltyAccount']);
    }

    private function ensurePaidStatsJoin(Builder $query): void
    {
        if ($this->hasPaidStatsJoin($query)) {
            return;
        }

        $statsSub = CustomerPaidOrderQuery::base()
            ->select(
                'customer_id',
                DB::raw('COUNT(*) as orders_count_paid'),
                DB::raw('COALESCE(SUM(total), 0) as total_paid_spend'),
                DB::raw('MAX(paid_at) as last_paid_at'),
            )
            ->groupBy('customer_id');

        $query->leftJoinSub($statsSub, 'po', 'po.customer_id', '=', 'customers.id');
    }

    private function hasPaidStatsJoin(Builder $query): bool
    {
        foreach ($query->getQuery()->joins ?? [] as $join) {
            if (($join->table ?? null) === 'po') {
                return true;
            }
        }

        return false;
    }

    private function applySegmentFilter(Builder $query, string $slug): void
    {
        match ($slug) {
            'new_customers' => $query->where('customers.created_at', '>=', now()->subDays(30)),
            'no_order_yet' => $query->whereRaw('COALESCE(po.orders_count_paid, 0) = 0'),
            'first_time_buyers' => $query->whereRaw('COALESCE(po.orders_count_paid, 0) = 1'),
            'repeat_customers' => $query->whereRaw('COALESCE(po.orders_count_paid, 0) >= 2'),
            // Inline numeric thresholds (not bindings): leftJoinSub already binds
            // excluded order statuses; extra ? bindings here collide on SQLite/PDO.
            'vip_customers' => $query
                ->whereRaw('COALESCE(po.orders_count_paid, 0) >= '.(int) $this->vipSettings->minPaidOrders())
                ->whereRaw('COALESCE(po.total_paid_spend, 0) >= '.(float) $this->vipSettings->minSpendMvr()),
            'dormant_30d' => $query
                ->whereRaw('COALESCE(po.orders_count_paid, 0) >= 1')
                ->where('po.last_paid_at', '<', now()->subDays(30)),
            'dormant_60d' => $query
                ->whereRaw('COALESCE(po.orders_count_paid, 0) >= 1')
                ->where('po.last_paid_at', '<', now()->subDays(60)),
            'dormant_90d' => $query
                ->whereRaw('COALESCE(po.orders_count_paid, 0) >= 1')
                ->where('po.last_paid_at', '<', now()->subDays(90)),
            'sms_opt_in' => $query->where(function ($q): void {
                $q->where('customers.sms_opt_out', false)->orWhereNull('customers.sms_opt_out');
            }),
            'sms_opt_out' => $query->where('customers.sms_opt_out', true),
            'incomplete_profile' => $query->where(function ($q): void {
                $q->where('customers.is_profile_complete', false)
                    ->orWhereNull('customers.name')
                    ->orWhere('customers.name', '');
            }),
            'credit_approved' => $query->where('customers.credit_enabled', true),
            'credit_with_balance' => $query
                ->where('customers.credit_enabled', true)
                ->where('customers.credit_balance_laar', '>', 0),
            'referral_customers' => $query->whereExists(function ($sub): void {
                $sub->select(DB::raw(1))
                    ->from('referrals')
                    ->whereColumn('referrals.referee_customer_id', 'customers.id');
            }),
            'review_customers' => $query->whereExists(function ($sub): void {
                $sub->select(DB::raw(1))
                    ->from('reviews')
                    ->whereColumn('reviews.customer_id', 'customers.id');
            }),
            default => throw new InvalidArgumentException("Unknown segment: {$slug}"),
        };
    }

    private function formatSegmentRow(Customer $customer): array
    {
        $ordersPaid = (int) ($customer->orders_count_paid ?? 0);
        $totalSpend = round((float) ($customer->total_paid_spend ?? 0), 2);
        $account = $customer->loyaltyAccount;

        return [
            'id' => $customer->id,
            'name' => $customer->name,
            'phone' => $customer->phone,
            'email' => $customer->email,
            'orders_count_paid' => $ordersPaid,
            'total_paid_spend' => $totalSpend,
            'average_order_value' => $ordersPaid > 0 ? round($totalSpend / $ordersPaid, 2) : 0.0,
            'last_order_at' => $customer->last_paid_at ?? $customer->last_order_at,
            'loyalty_points' => $account?->points_balance ?? (int) $customer->loyalty_points,
            'tier' => $account?->tier ?? $customer->tier,
            'sms_opt_out' => (bool) $customer->sms_opt_out,
            'credit_status' => $customer->credit_status ?? 'blocked',
            'credit_balance' => (int) ($customer->credit_balance_laar ?? 0),
            'tags' => $customer->tags->map(fn ($t) => [
                'id' => $t->id,
                'name' => $t->name,
                'color' => $t->color,
            ])->values()->all(),
            'badges' => $this->badgesForCustomer($customer),
        ];
    }

    private function paidStatsForCustomer(int $customerId): object
    {
        return CustomerPaidOrderQuery::base()
            ->where('customer_id', $customerId)
            ->selectRaw('COUNT(*) as orders_count_paid, COALESCE(SUM(total), 0) as total_paid_spend, MAX(paid_at) as last_paid_at')
            ->first() ?? (object) ['orders_count_paid' => 0, 'total_paid_spend' => 0, 'last_paid_at' => null];
    }

    private function isVip(object $stats): bool
    {
        return (int) ($stats->orders_count_paid ?? 0) >= $this->vipSettings->minPaidOrders()
            && (float) ($stats->total_paid_spend ?? 0) >= $this->vipSettings->minSpendMvr();
    }

    private function isDormant(object $stats, int $days): bool
    {
        if ((int) ($stats->orders_count_paid ?? 0) < 1 || empty($stats->last_paid_at)) {
            return false;
        }

        return now()->diffInDays($stats->last_paid_at) >= $days;
    }
}
