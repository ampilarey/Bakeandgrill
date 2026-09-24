<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\BulkSmsService;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsAudienceCriteria;
use App\Domains\Notifications\Support\SmsCampaignRecipes;
use App\Domains\Notifications\Support\SmsDeliveryRules;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Http\Controllers\Controller;
use App\Models\SmsCampaign;
use App\Models\SmsLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

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
     * Every SMS the system tried to send (SMS audit, 2026-09-24): filter
     * by the real type or its category, status, campaign, a date range, and
     * a search over number, customer name and message; totals for the
     * filter come with the page.
     */
    public function logs(Request $request): JsonResponse
    {
        $validated = $this->validateLogFilters($request);
        $query = $this->logQuery($validated)->with('customer:id,name,phone');

        $totals = (clone $query)->selectRaw('COUNT(*) as count, COALESCE(SUM(segments), 0) as segments, COALESCE(SUM(cost_estimate_mvr), 0) as cost_mvr')->first();
        $byStatus = (clone $query)->selectRaw('status, COUNT(*) as count')->groupBy('status')->pluck('count', 'status');

        $logs = $query->orderByDesc('id')->paginate((int) ($validated['per_page'] ?? 50));

        $logs->getCollection()->transform(function (SmsLog $log) {
            if (SmsTypeRegistry::shouldRedactBody((string) $log->type)) {
                $log->message = '[redacted]';
            }
            $entry = SmsTypeRegistry::resolve((string) $log->type);
            $log->setAttribute('type_label', $entry['label'] ?? $log->type);
            $log->setAttribute('category', $entry['category'] ?? null);
            $log->setAttribute('customer_name', $log->customer?->name);

            return $log;
        });

        $payload = $logs->toArray();
        $payload['totals'] = [
            'count' => (int) ($totals->count ?? 0),
            'segments' => (int) ($totals->segments ?? 0),
            'cost_mvr' => round((float) ($totals->cost_mvr ?? 0), 2),
            'by_status' => $byStatus->map(fn ($n) => (int) $n)->all(),
        ];
        $payload['types'] = collect(SmsTypeRegistry::all())
            ->map(fn (array $t) => ['key' => $t['key'], 'label' => $t['label'], 'category' => $t['category']])
            ->values()
            ->all();

        return response()->json($payload);
    }

    /**
     * GET /api/admin/sms/logs/export — the same filter as CSV, newest first, up to 50,000 rows.
     */
    public function exportLogs(Request $request): StreamedResponse
    {
        $validated = $this->validateLogFilters($request);
        $query = $this->logQuery($validated)->with('customer:id,name')->orderByDesc('id');
        $name = 'sms-log-' . now()->format('Ymd-Hi') . '.csv';

        return response()->streamDownload(function () use ($query): void {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Sent at', 'Created at', 'To', 'Customer', 'Type', 'Category', 'Status', 'Segments', 'Cost MVR', 'Reference', 'Message', 'Note']);
            $rows = 0;
            foreach ($query->cursor() as $log) {
                $entry = SmsTypeRegistry::resolve((string) $log->type);
                fputcsv($out, [
                    $log->sent_at?->toDateTimeString() ?? '',
                    $log->created_at?->toDateTimeString() ?? '',
                    $log->to,
                    $log->customer?->name ?? '',
                    $entry['label'] ?? $log->type,
                    $entry['category'] ?? '',
                    $log->status,
                    $log->segments,
                    number_format((float) $log->cost_estimate_mvr, 2, '.', ''),
                    trim(($log->reference_type ?? '') . ' ' . ($log->reference_id ?? '')),
                    SmsTypeRegistry::shouldRedactBody((string) $log->type) ? '[redacted]' : $log->message,
                    $log->error_message ?? '',
                ]);
                if (++$rows >= 50000) {
                    break;
                }
            }
            fclose($out);
        }, $name, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** @return array<string, mixed> */
    private function validateLogFilters(Request $request): array
    {
        return $request->validate([
            'type' => 'nullable|string|max:60',
            'category' => 'nullable|in:auth,transactional,marketing,staff,system',
            'status' => 'nullable|in:queued,sent,failed,demo,suppressed,disabled,deferred',
            'phone' => 'nullable|string|max:30',
            'q' => 'nullable|string|max:120',
            'customer_id' => 'nullable|integer',
            'campaign_id' => 'nullable|integer',
            'reference_type' => 'nullable|string|max:60',
            'from' => 'nullable|date',
            'to' => 'nullable|date',
            'days' => 'nullable|integer|min:1|max:365',
            'per_page' => 'nullable|integer|min:10|max:200',
        ]);
    }

    /** @param array<string, mixed> $f */
    private function logQuery(array $f): \Illuminate\Database\Eloquent\Builder
    {
        $query = SmsLog::query();

        if (!empty($f['type'])) {
            // A registry key, or one of its legacy aliases (otp → auth_customer_otp).
            $keys = [$f['type']];
            $resolved = SmsTypeRegistry::resolve((string) $f['type']);
            if ($resolved !== null) {
                $keys[] = $resolved['key'];
            }
            foreach (['otp' => 'auth_customer_otp', 'staff_password_reset' => 'auth_staff_password_reset', 'campaign' => 'marketing_campaign', 'promotion' => 'marketing_promotion', 'scheduled' => 'sms_scheduled'] as $alias => $key) {
                if (in_array($key, $keys, true)) {
                    $keys[] = $alias;
                }
            }
            $query->whereIn('type', array_values(array_unique($keys)));
        }
        if (!empty($f['category'])) {
            $keys = [];
            foreach (SmsTypeRegistry::all() as $entry) {
                if ($entry['category'] === $f['category']) {
                    $keys[] = $entry['key'];
                }
            }
            $keys[] = $f['category']; // legacy rows stored under the category name
            $query->whereIn('type', $keys);
        }
        if (!empty($f['status'])) {
            $query->where('status', $f['status']);
        }
        if (!empty($f['phone'])) {
            $query->byPhone($f['phone']);
        }
        if (!empty($f['customer_id'])) {
            $query->where('customer_id', $f['customer_id']);
        }
        if (!empty($f['campaign_id'])) {
            $query->where('campaign_id', $f['campaign_id']);
        }
        if (!empty($f['reference_type'])) {
            $query->where('reference_type', $f['reference_type']);
        }
        if (!empty($f['q'])) {
            $q = trim((string) $f['q']);
            $digits = preg_replace('/\D+/', '', $q) ?? '';
            $query->where(function ($w) use ($q, $digits): void {
                $w->where('message', 'like', '%' . $q . '%')
                    ->orWhere('error_message', 'like', '%' . $q . '%')
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', '%' . $q . '%'));
                if (strlen($digits) >= 4) {
                    $w->orWhere('to', 'like', '%' . $digits . '%');
                }
            });
        }
        if (!empty($f['from'])) {
            $query->where('created_at', '>=', \Carbon\Carbon::parse((string) $f['from'])->startOfDay());
        }
        if (!empty($f['to'])) {
            $query->where('created_at', '<=', \Carbon\Carbon::parse((string) $f['to'])->endOfDay());
        }
        if (!empty($f['days']) && empty($f['from'])) {
            $query->recent((int) $f['days']);
        }

        return $query;
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

        $campaigns->getCollection()->transform(function (SmsCampaign $campaign): SmsCampaign {
            if ($campaign->ab_test_enabled) {
                $campaign->setAttribute('ab_stats', $campaign->computeAbStats());
            }
            $campaign->setAttribute('audience_summary', SmsAudienceCriteria::describe(
                $this->bulkSms->effectiveCriteria((array) ($campaign->target_criteria ?? [])),
            ));

            return $campaign;
        });

        return response()->json($campaigns);
    }

    /**
     * GET /api/admin/sms/campaigns/recipes
     * Ready-made audiences + texts to start a campaign from (SMS audit, 2026-09-24).
     */
    public function recipes(): JsonResponse
    {
        return response()->json([
            'recipes' => SmsCampaignRecipes::all(),
            'order_types' => SmsAudienceCriteria::ORDER_TYPES,
            'segments' => collect(\App\Domains\Customers\Services\CustomerSegmentationService::SEGMENTS)
                ->map(fn (string $label, string $slug) => ['slug' => $slug, 'label' => $label])
                ->values()
                ->all(),
        ]);
    }

    /**
     * POST /api/admin/sms/campaigns/test-send
     * "Send a test to me": the exact text (opt-out line included, {name}
     * filled in) to the signed-in staff member's phone, or to a number they
     * typed. Logged under `staff_campaign_test`, so it never counts against
     * a customer's marketing cap.
     */
    public function testSend(Request $request, SmsService $sms): JsonResponse
    {
        $validated = $request->validate([
            'message' => 'required|string|max:1600',
            'message_variant_b' => 'nullable|string|max:1600',
            'phone' => 'nullable|string|max:30',
        ]);
        $user = $request->user();
        $to = trim((string) ($validated['phone'] ?? ''));
        if ($to === '') {
            $to = trim((string) ($user?->phone ?? ''));
        }
        if ($to === '') {
            return response()->json(['message' => 'Your staff account has no phone number. Add one under Staff, or type a number to send the test to.'], 422);
        }

        $marketing = SmsTypeRegistry::resolve('marketing_campaign') ?? ['category' => 'marketing'];
        $logs = [];
        foreach (array_filter(['a' => $validated['message'], 'b' => $validated['message_variant_b'] ?? null]) as $variant => $body) {
            $text = SmsDeliveryRules::withOptOutLine(BulkSmsService::personalise((string) $body, $user?->name), $marketing);
            $log = $sms->send(new SmsMessage(
                to: $to,
                message: $text,
                type: 'staff_campaign_test',
                referenceType: 'campaign_test',
                referenceId: $variant,
                actingUserId: $user?->id,
            ));
            $logs[] = ['variant' => $variant, 'status' => $log->status, 'to' => $log->to, 'message' => $log->message, 'error' => $log->error_message];
        }
        $failed = array_filter($logs, fn ($l) => !in_array($l['status'], ['sent', 'demo', 'queued'], true));

        return response()->json([
            'ok' => $failed === [],
            'message' => $failed === []
                ? 'Test sent to ' . $to . '.'
                : 'Test not sent: ' . (reset($failed)['error'] ?: reset($failed)['status']),
            'results' => $logs,
        ], $failed === [] ? 200 : 422);
    }

    /**
     * POST /api/admin/sms/campaigns/preview
     * Preview audience + cost estimate before creating a campaign.
     */
    public function preview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message' => 'required|string|max:1600',
            'message_variant_b' => 'nullable|string|max:1600',
            'ab_test_enabled' => 'nullable|boolean',
            'ab_split_percent' => 'nullable|integer|min:1|max:99',
            ...SmsAudienceCriteria::rules('target_criteria'),
        ]);

        $abEnabled = (bool) ($validated['ab_test_enabled'] ?? false);
        if ($abEnabled && empty($validated['message_variant_b'])) {
            return response()->json(['message' => 'Variant B message is required when A/B testing is enabled.'], 422);
        }

        $preview = $this->bulkSms->preview(
            $validated['message'],
            SmsAudienceCriteria::clean($validated['target_criteria'] ?? []),
            $abEnabled,
            $validated['message_variant_b'] ?? null,
            (int) ($validated['ab_split_percent'] ?? 50),
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
            'message_variant_b' => 'nullable|string|max:1600',
            'ab_test_enabled' => 'nullable|boolean',
            'ab_split_percent' => 'nullable|integer|min:1|max:99',
            'notes' => 'nullable|string|max:500',
            ...SmsAudienceCriteria::rules('target_criteria'),
            'scheduled_at' => 'nullable|date|after:now',
        ]);

        $abEnabled = (bool) ($validated['ab_test_enabled'] ?? false);
        if ($abEnabled && empty($validated['message_variant_b'])) {
            return response()->json(['message' => 'Variant B message is required when A/B testing is enabled.'], 422);
        }

        $campaign = SmsCampaign::create([
            'name' => $validated['name'],
            'message' => $validated['message'],
            'ab_test_enabled' => $abEnabled,
            'message_variant_b' => $abEnabled ? ($validated['message_variant_b'] ?? null) : null,
            'ab_split_percent' => (int) ($validated['ab_split_percent'] ?? 50),
            'notes' => $validated['notes'] ?? null,
            'target_criteria' => SmsAudienceCriteria::clean($validated['target_criteria'] ?? []),
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

        if ($campaign->ab_test_enabled) {
            $campaign->setAttribute('ab_stats', $campaign->computeAbStats());
        }
        $campaign->setAttribute('audience_summary', SmsAudienceCriteria::describe(
            $this->bulkSms->effectiveCriteria((array) ($campaign->target_criteria ?? [])),
        ));

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
