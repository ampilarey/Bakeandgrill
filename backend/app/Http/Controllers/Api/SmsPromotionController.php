<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\Services\SmsService;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSmsPromotionRequest;
use App\Jobs\SendSmsPromotionRecipient;
use App\Models\Customer;
use App\Models\SmsPromotion;
use App\Models\SmsPromotionRecipient;
use App\Services\AuditLogService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class SmsPromotionController extends Controller
{
    public function index()
    {
        $promotions = SmsPromotion::withCount('recipients')
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json(['promotions' => $promotions]);
    }

    public function show($id)
    {
        $promotion = SmsPromotion::with('recipients')
            ->findOrFail($id);

        return response()->json(['promotion' => $promotion]);
    }

    public function preview(StoreSmsPromotionRequest $request, SmsService $smsService)
    {
        Gate::authorize('sms.send');

        $validated = $request->validated();
        $filters = $validated['filters'] ?? [];

        $recipientsQuery = $this->buildRecipientQuery($filters);
        $count = $recipientsQuery->count();

        $estimate = $smsService->estimate($validated['message']);
        $estimate['recipient_count'] = $count;
        $estimate['total_cost_mvr'] = $count * $estimate['cost_mvr'];

        return response()->json([
            'estimate' => $estimate,
        ]);
    }

    public function send(StoreSmsPromotionRequest $request, SmsService $smsService)
    {
        Gate::authorize('sms.send');

        $validated = $request->validated();
        $filters = $validated['filters'] ?? [];

        $recipientsQuery = $this->buildRecipientQuery($filters);
        $recipientCount = $recipientsQuery->count();

        if ($recipientCount === 0) {
            return response()->json(['message' => 'No recipients found.'], 422);
        }

        if ($recipientCount > 10000) {
            return response()->json(['message' => 'Too many recipients. Refine filters.'], 422);
        }

        // Bug-019: daily SMS-blast safety net. Counts every recipient
        // queued or sent in the last 24 hours, including by other
        // staff members, and refuses if adding this campaign would
        // push the rolling 24-hour total above 5,000 recipients.
        // Catches double-fired blasts and prevents a single mis-
        // taped 8,000-recipient promotion from blowing the SMS
        // budget for the day. Override the limit (or raise it) by
        // adding `services.dhiraagu.daily_recipient_cap` to config.
        $dailyCap = (int) config('services.dhiraagu.daily_recipient_cap', 5000);
        if ($dailyCap > 0) {
            $sentInLast24h = (int) SmsPromotion::where('created_at', '>=', now()->subDay())
                ->whereIn('status', ['queued', 'sending', 'sent', 'completed'])
                ->sum('recipient_count');

            if ($sentInLast24h + $recipientCount > $dailyCap) {
                return response()->json([
                    'message' => sprintf(
                        'Daily SMS cap reached. Sent %s in the last 24h, this campaign adds %s, cap is %s. Try again later or split the campaign.',
                        number_format($sentInLast24h),
                        number_format($recipientCount),
                        number_format($dailyCap),
                    ),
                ], 429);
            }
        }

        $promotion = DB::transaction(function () use ($validated, $filters, $recipientsQuery) {
            $promotion = SmsPromotion::create([
                'user_id' => request()->user()?->id,
                'name' => $validated['name'] ?? null,
                'message' => $validated['message'],
                'status' => 'queued',
                'recipient_count' => $recipientsQuery->count(),
                'filters' => $filters,
            ]);

            $recipientsQuery->orderBy('id')->chunk(500, function ($chunk) use ($promotion) {
                foreach ($chunk as $customer) {
                    SmsPromotionRecipient::create([
                        'sms_promotion_id' => $promotion->id,
                        'customer_id' => $customer->id,
                        'phone' => $customer->phone,
                        'status' => 'queued',
                    ]);
                }
            });

            return $promotion;
        });

        SmsPromotionRecipient::where('sms_promotion_id', $promotion->id)
            ->orderBy('id')
            ->chunk(500, function ($chunk) {
                foreach ($chunk as $recipient) {
                    SendSmsPromotionRecipient::dispatch($recipient->id);
                }
            });

        app(AuditLogService::class)->log(
            'sms_promotion.sent',
            'SmsPromotion',
            $promotion->id,
            [],
            $promotion->toArray(),
            [],
            $request,
        );

        return response()->json(['promotion' => $promotion->fresh('recipients')], 201);
    }

    private function buildRecipientQuery(array $filters)
    {
        $query = Customer::query();

        $activeOnly = $filters['active_only'] ?? true;
        if ($activeOnly) {
            $query->where('is_active', true);
        }

        $includeOptedOut = $filters['include_opted_out'] ?? false;
        if (!$includeOptedOut) {
            $query->where('sms_opt_out', false);
        }

        if (!empty($filters['last_order_days'])) {
            $query->where('last_order_at', '>=', now()->subDays((int) $filters['last_order_days']));
        }

        if (!empty($filters['min_orders'])) {
            $query->withCount('orders')
                ->having('orders_count', '>=', (int) $filters['min_orders']);
        }

        return $query;
    }
}
