<?php

declare(strict_types=1);

namespace App\Domains\Customers\Services;

use App\Domains\Customers\Support\CustomerPaidOrderQuery;
use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\Referral;
use App\Models\ReferralCode;
use App\Models\Review;
use App\Models\SmsLog;
use Illuminate\Support\Facades\DB;

final class CustomerGrowthSummaryService
{
    public function __construct(
        private readonly CustomerCreditService $credit,
        private readonly CustomerSegmentationService $segments,
        private readonly VipTagSyncService $vipTagSync,
    ) {}

    public function summary(Customer $customer, bool $includeCredit = true): array
    {
        $this->vipTagSync->syncCustomer($customer);

        $customer->loadCount('orders');
        $customer->load(['tags', 'loyaltyAccount', 'followUpNotes' => fn ($q) => $q->with('staff:id,name')->whereNull('completed_at')->latest()]);

        $paidStats = CustomerPaidOrderQuery::base()
            ->where('customer_id', $customer->id)
            ->selectRaw('COUNT(*) as orders_count, COALESCE(SUM(total), 0) as total_spent, MIN(paid_at) as first_paid_at, MAX(paid_at) as last_paid_at')
            ->first();

        $ordersCount = (int) ($paidStats->orders_count ?? 0);
        $totalSpent = round((float) ($paidStats->total_spent ?? 0), 2);
        $lastPaidAt = $paidStats->last_paid_at;
        $daysSinceLast = $lastPaidAt ? now()->diffInDays($lastPaidAt) : null;

        $account = $customer->loyaltyAccount ?? LoyaltyAccount::where('customer_id', $customer->id)->first();

        return [
            'profile' => CustomerAdminPresenter::format($customer),
            'lifetime' => [
                'paid_orders_count' => $ordersCount,
                'total_paid_spend' => $totalSpent,
                'average_order_value' => $ordersCount > 0 ? round($totalSpent / $ordersCount, 2) : 0.0,
                'first_order_at' => $paidStats->first_paid_at,
                'last_order_at' => $lastPaidAt,
                'days_since_last_order' => $daysSinceLast,
            ],
            'favourite_items' => $this->favouriteItems($customer->id),
            'most_used_order_type' => $this->mostUsedOrderType($customer->id),
            'loyalty' => [
                'points_balance' => $account?->points_balance ?? (int) $customer->loyalty_points,
                'points_held' => $account?->points_held ?? 0,
                'available_points' => $account?->availablePoints() ?? (int) $customer->loyalty_points,
                'lifetime_points' => $account?->lifetime_points ?? 0,
                'tier' => $account?->tier ?? $customer->tier,
            ],
            'credit' => $includeCredit ? $this->credit->creditSummary($customer) : null,
            'referral' => [
                'codes_count' => ReferralCode::where('customer_id', $customer->id)->count(),
                'redemptions_as_referee' => Referral::where('referee_customer_id', $customer->id)->count(),
            ],
            'reviews' => [
                'count' => Review::where('customer_id', $customer->id)->count(),
                'average_rating' => round((float) Review::where('customer_id', $customer->id)->avg('rating'), 1),
            ],
            'sms' => [
                'opt_out' => (bool) $customer->sms_opt_out,
                'messages_sent' => SmsLog::where('customer_id', $customer->id)->count(),
                'last_sent_at' => SmsLog::where('customer_id', $customer->id)->max('created_at'),
            ],
            'tags' => $customer->tags->map(fn ($t) => [
                'id' => $t->id,
                'name' => $t->name,
                'color' => $t->color,
            ])->values()->all(),
            'follow_up_notes' => $customer->followUpNotes->map(fn ($n) => [
                'id' => $n->id,
                'note' => $n->note,
                'follow_up_at' => $n->follow_up_at?->toIso8601String(),
                'completed_at' => $n->completed_at?->toIso8601String(),
                'staff' => $n->staff?->name,
                'created_at' => $n->created_at?->toIso8601String(),
            ])->values()->all(),
            'badges' => $this->segments->badgesForCustomer($customer),
        ];
    }

    /** @return list<array{item_id: int, name: string, quantity: int}> */
    private function favouriteItems(int $customerId): array
    {
        return DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->where('orders.customer_id', $customerId)
            ->whereNotNull('orders.paid_at')
            ->whereNotIn('orders.status', CustomerPaidOrderQuery::EXCLUDED_STATUSES)
            ->select('items.id as item_id', 'items.name', DB::raw('SUM(order_items.quantity) as quantity'))
            ->groupBy('items.id', 'items.name')
            ->orderByDesc('quantity')
            ->limit(3)
            ->get()
            ->map(fn ($r) => [
                'item_id' => (int) $r->item_id,
                'name' => $r->name,
                'quantity' => (int) $r->quantity,
            ])
            ->all();
    }

    private function mostUsedOrderType(int $customerId): ?string
    {
        $row = CustomerPaidOrderQuery::base()
            ->where('customer_id', $customerId)
            ->select('type', DB::raw('COUNT(*) as cnt'))
            ->groupBy('type')
            ->orderByDesc('cnt')
            ->first();

        return $row?->type;
    }
}
