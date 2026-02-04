<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSmsPromotionRequest;
use App\Models\Customer;
use App\Models\SmsPromotion;
use App\Models\SmsPromotionRecipient;
use App\Jobs\SendSmsPromotionRecipient;
use App\Services\AuditLogService;
use App\Services\SmsService;
use Illuminate\Http\Request;
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
            $request
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
