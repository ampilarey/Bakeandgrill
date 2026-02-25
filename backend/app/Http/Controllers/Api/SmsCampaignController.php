<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\Services\BulkSmsService;
use App\Http\Controllers\Controller;
use App\Models\SmsCampaign;
use App\Models\SmsLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin endpoints for SMS campaigns and log viewing.
 * All endpoints require staff auth.
 */
class SmsCampaignController extends Controller
{
    public function __construct(private BulkSmsService $bulkSms) {}

    // ── SMS Logs ──────────────────────────────────────────────────────────────

    /**
     * GET /api/admin/sms/logs
     * Full audit log of every SMS sent (OTP, promo, campaign, transactional).
     */
    public function logs(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => 'nullable|in:otp,promotion,campaign,transactional',
            'status' => 'nullable|in:queued,sent,failed,demo',
            'phone' => 'nullable|string',
            'customer_id' => 'nullable|integer',
            'days' => 'nullable|integer|min:1|max:365',
            'per_page' => 'nullable|integer|min:10|max:200',
        ]);

        $query = SmsLog::with('customer')
            ->orderByDesc('created_at');

        if (!empty($validated['type'])) {
            $query->ofType($validated['type']);
        }

        if (!empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (!empty($validated['phone'])) {
            $query->byPhone($validated['phone']);
        }

        if (!empty($validated['customer_id'])) {
            $query->where('customer_id', $validated['customer_id']);
        }

        if (!empty($validated['days'])) {
            $query->recent((int) $validated['days']);
        }

        $logs = $query->paginate($validated['per_page'] ?? 50);

        return response()->json($logs);
    }

    /**
     * GET /api/admin/sms/logs/stats
     * Aggregate stats: total sent, failed, cost by type, last 30 days.
     */
    public function logStats(): JsonResponse
    {
        $stats = SmsLog::recent(30)
            ->selectRaw('type, status, COUNT(*) as count, SUM(cost_estimate_mvr) as total_cost_mvr, SUM(segments) as total_segments')
            ->groupBy('type', 'status')
            ->get();

        return response()->json(['stats' => $stats]);
    }

    // ── SMS Campaigns ─────────────────────────────────────────────────────────

    /**
     * GET /api/admin/sms/campaigns
     */
    public function index(): JsonResponse
    {
        $campaigns = SmsCampaign::with('creator')
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($campaigns);
    }

    /**
     * POST /api/admin/sms/campaigns/preview
     * Preview audience + cost estimate before creating a campaign.
     */
    public function preview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message' => 'required|string|max:1600',
            'target_criteria' => 'nullable|array',
            'target_criteria.tier' => 'nullable|array',
            'target_criteria.tier.*' => 'in:bronze,silver,gold',
            'target_criteria.last_order_days' => 'nullable|integer|min:1',
            'target_criteria.opted_in' => 'nullable|boolean',
            'target_criteria.has_loyalty' => 'nullable|boolean',
        ]);

        $preview = $this->bulkSms->preview(
            $validated['message'],
            $validated['target_criteria'] ?? [],
        );

        return response()->json($preview);
    }

    /**
     * POST /api/admin/sms/campaigns
     * Create a campaign in draft state.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'message' => 'required|string|max:1600',
            'notes' => 'nullable|string|max:500',
            'target_criteria' => 'nullable|array',
            'scheduled_at' => 'nullable|date|after:now',
        ]);

        $campaign = SmsCampaign::create([
            'name' => $validated['name'],
            'message' => $validated['message'],
            'notes' => $validated['notes'] ?? null,
            'target_criteria' => $validated['target_criteria'] ?? [],
            'status' => 'draft',
            'scheduled_at' => $validated['scheduled_at'] ?? null,
            'created_by' => $request->user()?->id,
        ]);

        return response()->json(['campaign' => $campaign], 201);
    }

    /**
     * GET /api/admin/sms/campaigns/{campaign}
     */
    public function show(SmsCampaign $campaign): JsonResponse
    {
        $campaign->load(['creator', 'recipients' => fn ($q) => $q->limit(20)]);

        return response()->json(['campaign' => $campaign]);
    }

    /**
     * POST /api/admin/sms/campaigns/{campaign}/send
     * Resolve audience, populate recipients, and dispatch queued jobs.
     */
    public function send(SmsCampaign $campaign): JsonResponse
    {
        if (!$campaign->canStart()) {
            return response()->json([
                'message' => "Campaign cannot be started (status: {$campaign->status}).",
            ], 422);
        }

        $campaign = $this->bulkSms->dispatch($campaign);

        return response()->json([
            'message' => "Campaign dispatched to {$campaign->total_recipients} recipients.",
            'campaign' => $campaign,
        ]);
    }

    /**
     * POST /api/admin/sms/campaigns/{campaign}/cancel
     */
    public function cancel(SmsCampaign $campaign): JsonResponse
    {
        if (!$campaign->canCancel()) {
            return response()->json([
                'message' => "Campaign cannot be cancelled (status: {$campaign->status}).",
            ], 422);
        }

        $campaign->markCancelled();

        return response()->json(['campaign' => $campaign]);
    }
}
