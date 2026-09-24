<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Services;

use App\Domains\Customers\Services\CustomerSegmentationService;
use App\Domains\Customers\Support\CustomerPaidOrderQuery;
use App\Domains\Marketing\Services\ItemAffinityService;
use App\Domains\Notifications\Jobs\SendSmsCampaignRecipientJob;
use App\Domains\Notifications\Support\SmsAudienceCriteria;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemPairStat;
use App\Models\SmsAudience;
use App\Models\SmsCampaign;
use App\Models\SmsCampaignRecipient;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

/**
 * Manages bulk SMS campaigns targeting customer segments.
 *
 * Targeting criteria (JSON) — see SmsAudienceCriteria for the full list:
 * {
 *   "segment": "vip_customers",          // CRM segment slug (CustomerSegmentationService)
 *   "tier": ["gold", "silver"],          // loyalty tier filter
 *   "last_order_days": 30,               // customers who ordered in last N days
 *   "opted_in": true,                    // exclude opted-out (default: true)
 *   "has_loyalty": true,                 // only customers with loyalty account
 *   "bought_item_ids": [12, 15],         // bought any of these in the window
 *   "bought_category_ids": [3],          // bought from these categories in the window
 *   "not_bought_item_ids": [40],         // never bought any of these
 *   "likes_item_id": 12,                 // bought it or what usually goes with it
 *   "order_types": ["delivery"],         // ordered this way in the window
 *   "window_days": 90,                   // window for the purchase filters
 *   "min_spend_mvr": 500,                // paid spend, all time
 *   "min_orders": 3,                     // paid orders, all time
 *   "dormant_days": 60,                  // last paid order older than N days
 *   "birthday_month": 10,
 *   "audience_id": 4                     // a saved audience as the base
 * }
 */
class BulkSmsService
{
    public function __construct(
        private SmsService $sms,
        private CustomerSegmentationService $segments,
    ) {}

    /**
     * Preview campaign: resolve target audience + estimate cost.
     * Does NOT send. Safe to call before confirming.
     */
    public function preview(
        string $message,
        array $criteria,
        bool $abTestEnabled = false,
        ?string $messageVariantB = null,
        int $abSplitPercent = 50,
    ): array {
        $customers = $this->resolveAudience($criteria);
        $count = $customers->count();

        if ($abTestEnabled && filled($messageVariantB)) {
            $split = max(1, min(99, $abSplitPercent));
            $countA = (int) round($count * ($split / 100));
            $countB = $count - $countA;
            $estimateA = $this->sms->estimateBulk($message, $countA);
            $estimateB = $this->sms->estimateBulk($messageVariantB, $countB);
            $totalCost = (float) $estimateA['total_cost_mvr'] + (float) $estimateB['total_cost_mvr'];
            $totalSegments = $estimateA['total_segments'] + $estimateB['total_segments'];
        } else {
            $estimateA = $this->sms->estimateBulk($message, $count);
            $totalCost = (float) $estimateA['total_cost_mvr'];
            $totalSegments = $estimateA['total_segments'];
            $estimateB = null;
            $countA = $count;
            $countB = 0;
        }

        return [
            'recipient_count' => $count,
            'audience_summary' => SmsAudienceCriteria::describe($this->effectiveCriteria($criteria)),
            'message_preview' => mb_substr($message, 0, 160),
            'per_message' => $estimateA['per_message'],
            'total_segments' => $totalSegments,
            'total_cost_mvr' => number_format($totalCost, 2, '.', ''),
            'ab_test_enabled' => $abTestEnabled && filled($messageVariantB),
            'ab_split' => $abTestEnabled && filled($messageVariantB)
                ? ['variant_a' => $countA, 'variant_b' => $countB]
                : null,
            'sample_recipients' => $customers->take(5)->map(fn ($c) => [
                'name' => $c->name,
                'phone' => $this->sms->normalizePhone($c->phone),
                'tier' => $c->tier,
            ])->values(),
        ];
    }

    /**
     * Create the campaign, populate recipients, and dispatch jobs.
     * Returns the campaign immediately; sending runs in the background.
     */
    public function dispatch(SmsCampaign $campaign): SmsCampaign
    {
        if (!$campaign->canStart()) {
            throw new \RuntimeException("Campaign {$campaign->id} cannot be started (status: {$campaign->status}).");
        }

        $customers = $this->resolveAudience($campaign->target_criteria ?? []);

        if ($customers->isEmpty()) {
            throw new \RuntimeException('No eligible recipients found for this campaign.');
        }

        // Pre-flight spend ceiling (SmsService also enforces per-message).
        $estimate = $this->sms->estimateBulk((string) $campaign->message, $customers->count());
        $budgetBlock = \App\Domains\Notifications\Support\SmsBudgetGate::wouldExceedForBulk(
            (int) $estimate['total_segments'],
            $campaign->id,
        );
        if ($budgetBlock !== null) {
            throw new \RuntimeException($budgetBlock);
        }

        DB::transaction(function () use ($campaign, $customers): void {
            $split = $campaign->ab_test_enabled
                ? max(1, min(99, (int) ($campaign->ab_split_percent ?? 50)))
                : 100;
            $abActive = $campaign->ab_test_enabled && filled($campaign->message_variant_b);
            $countA = $abActive ? (int) round($customers->count() * ($split / 100)) : $customers->count();

            foreach ($customers->values() as $index => $customer) {
                $variant = $abActive && $index >= $countA ? 'b' : 'a';

                SmsCampaignRecipient::create([
                    'campaign_id' => $campaign->id,
                    'customer_id' => $customer->id,
                    'phone' => $this->sms->normalizePhone($customer->phone),
                    'name' => $customer->name,
                    'variant' => $variant,
                    'status' => 'pending',
                ]);
            }

            $campaign->update(['total_recipients' => $customers->count()]);
            $campaign->markStarted();
        });

        // Dispatch one job per recipient (queued, respects backoff).
        // Resilient so a Redis outage cannot 500 the admin send endpoint.
        foreach ($campaign->recipients()->where('status', 'pending')->cursor() as $recipient) {
            \App\Support\ResilientDispatch::jobClass(SendSmsCampaignRecipientJob::class, $recipient);
        }

        return $campaign->fresh();
    }

    /**
     * `{name}` in a campaign text becomes the customer's first name, or
     * "there" when the account has none — "Hi {name}" never goes out as
     * "Hi " to someone who only ever typed a phone number.
     */
    public static function personalise(string $body, ?string $name): string
    {
        if (!str_contains($body, '{name}')) {
            return $body;
        }
        $first = trim((string) strtok(trim((string) $name), ' '));

        return str_replace('{name}', $first !== '' ? $first : 'there', $body);
    }

    /**
     * Resolve the target audience from criteria.
     */
    public function resolveAudience(array $criteria): \Illuminate\Database\Eloquent\Collection
    {
        return $this->audienceQuery($criteria)->get();
    }

    public function audienceCount(array $criteria): int
    {
        return (int) $this->audienceQuery($criteria)->count();
    }

    /**
     * A saved audience's criteria under the inline ones (SMS audit,
     * 2026-09-24): a scheduled campaign built on "Delivery regulars" picks
     * up whatever that audience means on the day it sends.
     *
     * @param array<string, mixed> $criteria
     * @return array<string, mixed>
     */
    public function effectiveCriteria(array $criteria): array
    {
        $criteria = SmsAudienceCriteria::clean($criteria);
        if (empty($criteria['audience_id'])) {
            return $criteria;
        }
        $saved = SmsAudience::find((int) $criteria['audience_id']);
        $base = $saved !== null ? SmsAudienceCriteria::clean((array) ($saved->criteria ?? [])) : [];
        unset($base['audience_id'], $criteria['audience_id']);

        return array_merge($base, $criteria);
    }

    /** @return Builder<Customer> */
    public function audienceQuery(array $criteria): Builder
    {
        $criteria = $this->effectiveCriteria($criteria);
        $query = Customer::query();

        // Default: exclude opted-out customers
        $optedIn = $criteria['opted_in'] ?? true;
        if ($optedIn) {
            $query->where(function ($q): void {
                $q->whereNull('sms_opt_out')->orWhere('sms_opt_out', false);
            });
        }

        // CRM segment (e.g. vip_customers) — intersects with other filters
        if (!empty($criteria['segment'])) {
            $slug = (string) $criteria['segment'];
            if (!isset(CustomerSegmentationService::SEGMENTS[$slug])) {
                return Customer::query()->whereRaw('0 = 1');
            }

            $ids = $this->segments->customerIdsInSegment($slug);
            if ($ids->isEmpty()) {
                return Customer::query()->whereRaw('0 = 1');
            }

            $query->whereIn('id', $ids->all());
        }

        // Loyalty tier filter
        if (!empty($criteria['tier'])) {
            $query->whereIn('tier', (array) $criteria['tier']);
        }

        // Last order filter
        if (!empty($criteria['last_order_days'])) {
            $days = (int) $criteria['last_order_days'];
            $query->whereHas('orders', function ($q) use ($days): void {
                $q->where('created_at', '>=', now()->subDays($days))
                    ->whereIn('status', ['paid', 'completed']);
            });
        }

        // Only customers with a loyalty account
        if (!empty($criteria['has_loyalty'])) {
            $query->whereHas('loyaltyAccount');
        }

        // ── Purchase-based (SMS audit, 2026-09-24) ─────────────────────────
        $windowDays = max(1, (int) ($criteria['window_days'] ?? SmsAudienceCriteria::DEFAULT_WINDOW_DAYS));
        $since = now()->subDays($windowDays);

        if (!empty($criteria['bought_item_ids'])) {
            $this->whereBoughtItems($query, array_map('intval', (array) $criteria['bought_item_ids']), $since);
        }

        if (!empty($criteria['bought_category_ids'])) {
            $itemIds = $this->itemIdsInCategories(array_map('intval', (array) $criteria['bought_category_ids']));
            if ($itemIds === []) {
                return Customer::query()->whereRaw('0 = 1');
            }
            $this->whereBoughtItems($query, $itemIds, $since);
        }

        if (!empty($criteria['likes_item_id'])) {
            $this->whereBoughtItems($query, $this->itemIdsLiked((int) $criteria['likes_item_id']), $since);
        }

        if (!empty($criteria['not_bought_item_ids'])) {
            $ids = array_map('intval', (array) $criteria['not_bought_item_ids']);
            $query->whereNotExists(fn (QueryBuilder $sub) => $this->paidOrderItemsSub($sub, $ids, null));
        }

        if (!empty($criteria['order_types'])) {
            $types = array_map('strval', (array) $criteria['order_types']);
            $query->whereExists(function (QueryBuilder $sub) use ($types, $since): void {
                $this->paidOrdersSub($sub)
                    ->where('orders.paid_at', '>=', $since->toDateTimeString())
                    ->whereIn('orders.type', $types);
            });
        }

        if (!empty($criteria['min_spend_mvr']) || !empty($criteria['min_orders']) || !empty($criteria['dormant_days'])) {
            $stats = CustomerPaidOrderQuery::base()
                ->select('customer_id')
                ->whereNotNull('customer_id')
                ->groupBy('customer_id');
            if (!empty($criteria['min_spend_mvr'])) {
                $stats->havingRaw('COALESCE(SUM(total), 0) >= ' . number_format((float) $criteria['min_spend_mvr'], 2, '.', ''));
            }
            if (!empty($criteria['min_orders'])) {
                $stats->havingRaw('COUNT(*) >= ' . (int) $criteria['min_orders']);
            }
            if (!empty($criteria['dormant_days'])) {
                $cutoff = now()->subDays((int) $criteria['dormant_days'])->toDateTimeString();
                $stats->havingRaw("MAX(paid_at) < '{$cutoff}'");
            }
            $query->whereIn('customers.id', $stats);
        }

        if (!empty($criteria['birthday_month'])) {
            $query->whereNotNull('date_of_birth')->whereMonth('date_of_birth', (int) $criteria['birthday_month']);
        }

        // Must have a phone number
        $query->whereNotNull('phone')->where('phone', '!=', '');

        return $query;
    }

    /**
     * @param Builder<Customer> $query
     * @param list<int> $itemIds
     */
    private function whereBoughtItems(Builder $query, array $itemIds, \Carbon\CarbonInterface $since): void
    {
        if ($itemIds === []) {
            $query->whereRaw('0 = 1');

            return;
        }
        $query->whereExists(fn (QueryBuilder $sub) => $this->paidOrderItemsSub($sub, $itemIds, $since));
    }

    /** Paid, unrefunded orders of the outer customer. */
    private function paidOrdersSub(QueryBuilder $sub): QueryBuilder
    {
        return $sub->select(DB::raw(1))
            ->from('orders')
            ->whereColumn('orders.customer_id', 'customers.id')
            ->whereNotNull('orders.paid_at')
            ->whereNotIn('orders.status', CustomerPaidOrderQuery::EXCLUDED_STATUSES);
    }

    /** @param list<int> $itemIds */
    private function paidOrderItemsSub(QueryBuilder $sub, array $itemIds, ?\Carbon\CarbonInterface $since): QueryBuilder
    {
        $this->paidOrdersSub($sub)
            ->join('order_items', 'order_items.order_id', '=', 'orders.id')
            ->whereNull('order_items.deleted_at')
            ->whereIn('order_items.item_id', $itemIds);
        if ($since !== null) {
            $sub->where('orders.paid_at', '>=', $since->toDateTimeString());
        }

        return $sub;
    }

    /**
     * Items in these categories and their child categories.
     *
     * @param list<int> $categoryIds
     * @return list<int>
     */
    private function itemIdsInCategories(array $categoryIds): array
    {
        $all = array_values(array_unique([
            ...$categoryIds,
            ...Category::query()->whereIn('parent_id', $categoryIds)->pluck('id')->map(fn ($id) => (int) $id)->all(),
        ]));

        return Item::query()->whereIn('category_id', $all)->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * "Customers who like X": the item itself plus what the affinity data
     * says usually goes with it, so a new dish can be announced to the
     * people whose baskets say they would want it.
     *
     * @return list<int>
     */
    private function itemIdsLiked(int $itemId): array
    {
        $paired = ItemPairStat::query()
            ->where('item_id', $itemId)
            ->where('pair_count', '>=', ItemAffinityService::minPairSupport())
            ->where('lift', '>', 1)
            ->orderByDesc('lift')
            ->limit(5)
            ->pluck('paired_item_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        return array_values(array_unique([$itemId, ...$paired]));
    }
}
