<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Services;

use App\Domains\Notifications\Jobs\SendSmsCampaignRecipientJob;
use App\Models\Customer;
use App\Models\SmsCampaign;
use App\Models\SmsCampaignRecipient;
use Illuminate\Support\Facades\DB;

/**
 * Manages bulk SMS campaigns targeting customer segments.
 *
 * Targeting criteria (JSON):
 * {
 *   "tier": ["gold", "silver"],          // loyalty tier filter
 *   "last_order_days": 30,               // customers who ordered in last N days
 *   "opted_in": true,                    // exclude opted-out (default: true)
 *   "has_loyalty": true                  // only customers with loyalty account
 * }
 */
class BulkSmsService
{
    public function __construct(private SmsService $sms) {}

    /**
     * Preview campaign: resolve target audience + estimate cost.
     * Does NOT send. Safe to call before confirming.
     */
    public function preview(string $message, array $criteria): array
    {
        $customers = $this->resolveAudience($criteria);
        $estimate = $this->sms->estimateBulk($message, $customers->count());

        return [
            'recipient_count' => $customers->count(),
            'message_preview' => mb_substr($message, 0, 160),
            'per_message' => $estimate['per_message'],
            'total_segments' => $estimate['total_segments'],
            'total_cost_mvr' => $estimate['total_cost_mvr'],
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

        DB::transaction(function () use ($campaign, $customers): void {
            // Populate recipients
            foreach ($customers as $customer) {
                SmsCampaignRecipient::create([
                    'campaign_id' => $campaign->id,
                    'customer_id' => $customer->id,
                    'phone' => $this->sms->normalizePhone($customer->phone),
                    'name' => $customer->name,
                    'status' => 'pending',
                ]);
            }

            $campaign->update(['total_recipients' => $customers->count()]);
            $campaign->markStarted();
        });

        // Dispatch one job per recipient (queued, respects backoff)
        foreach ($campaign->recipients()->where('status', 'pending')->cursor() as $recipient) {
            SendSmsCampaignRecipientJob::dispatch($recipient);
        }

        return $campaign->fresh();
    }

    /**
     * Resolve the target audience from criteria.
     */
    public function resolveAudience(array $criteria): \Illuminate\Database\Eloquent\Collection
    {
        $query = Customer::query();

        // Default: exclude opted-out customers
        $optedIn = $criteria['opted_in'] ?? true;
        if ($optedIn) {
            $query->where(function ($q): void {
                $q->whereNull('sms_opt_out')->orWhere('sms_opt_out', false);
            });
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

        // Must have a phone number
        $query->whereNotNull('phone')->where('phone', '!=', '');

        return $query->get();
    }
}
