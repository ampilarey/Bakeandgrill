<?php

declare(strict_types=1);

namespace App\Domains\System\Services;

use App\Models\Order;
use App\Models\SmsLog;
use App\Models\WebhookLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class SystemHealthService
{
    /**
     * Aggregate operational health signals for the owner dashboard.
     *
     * @return array<string, mixed>
     */
    public function detailed(): array
    {
        $since24h = now()->subHours(24);
        $stuckMinutes = (int) config('ordering.payment_pending_ttl_minutes', 30);

        $failedJobs24h = (int) DB::table('failed_jobs')
            ->where('failed_at', '>=', $since24h)
            ->count();

        $webhookFailures24h = (int) WebhookLog::query()
            ->where('gateway', 'bml')
            ->where('status', 'failed')
            ->where('created_at', '>=', $since24h)
            ->count();

        $paymentPendingStuck = (int) Order::query()
            ->where('status', 'payment_pending')
            ->where('created_at', '<', now()->subMinutes($stuckMinutes))
            ->count();

        $smsFailed24h = (int) SmsLog::query()
            ->where('status', 'failed')
            ->where('created_at', '>=', $since24h)
            ->count();

        $queueDepth = (int) DB::table('jobs')
            ->whereNull('reserved_at')
            ->where('available_at', '<=', now()->timestamp)
            ->count();

        $printProxy = $this->checkPrintProxy();

        $recentFailedJobs = DB::table('failed_jobs')
            ->where('failed_at', '>=', $since24h)
            ->orderByDesc('failed_at')
            ->limit(10)
            ->get(['id', 'uuid', 'connection', 'queue', 'failed_at'])
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'uuid' => $row->uuid,
                'connection' => $row->connection,
                'queue' => $row->queue,
                'failed_at' => $row->failed_at,
            ])
            ->values()
            ->all();

        $recentWebhookFailures = WebhookLog::query()
            ->where('gateway', 'bml')
            ->where('status', 'failed')
            ->where('created_at', '>=', $since24h)
            ->orderByDesc('created_at')
            ->limit(10)
            ->get(['id', 'idempotency_key', 'event_type', 'error_message', 'created_at'])
            ->map(fn (WebhookLog $log) => [
                'id' => $log->id,
                'idempotency_key' => $log->idempotency_key,
                'event_type' => $log->event_type,
                'error_message' => $log->error_message,
                'created_at' => $log->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $stuckOrders = Order::query()
            ->where('status', 'payment_pending')
            ->where('created_at', '<', now()->subMinutes($stuckMinutes))
            ->orderBy('created_at')
            ->limit(10)
            ->get(['id', 'order_number', 'total', 'created_at'])
            ->map(fn (Order $order) => [
                'id' => $order->id,
                'order_number' => $order->order_number,
                'total' => (float) $order->total,
                'created_at' => $order->created_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $issues = $failedJobs24h + $webhookFailures24h + $paymentPendingStuck + $smsFailed24h;
        if ($printProxy['status'] === 'unreachable') {
            $issues++;
        }

        return [
            'status' => $issues > 0 ? 'degraded' : 'ok',
            'failed_jobs_24h' => $failedJobs24h,
            'webhook_failures_24h' => $webhookFailures24h,
            'payment_pending_stuck' => $paymentPendingStuck,
            'sms_failed_24h' => $smsFailed24h,
            'print_proxy_ok' => $printProxy['ok'],
            'print_proxy_status' => $printProxy['status'],
            'queue_depth' => $queueDepth,
            'checked_at' => now()->toIso8601String(),
            'recent_failed_jobs' => $recentFailedJobs,
            'recent_webhook_failures' => $recentWebhookFailures,
            'stuck_payment_pending_orders' => $stuckOrders,
        ];
    }

    /**
     * @return array{ok: bool|null, status: string}
     */
    private function checkPrintProxy(): array
    {
        $url = (string) config('services.print_proxy.url');

        if ($url === '') {
            return ['ok' => null, 'status' => 'not_configured'];
        }

        try {
            $response = Http::timeout(2)->get(rtrim($url, '/') . '/health');

            return [
                'ok' => $response->successful(),
                'status' => $response->successful() ? 'ok' : 'unreachable',
            ];
        } catch (\Throwable) {
            return ['ok' => false, 'status' => 'unreachable'];
        }
    }
}
