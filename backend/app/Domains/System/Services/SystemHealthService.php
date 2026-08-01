<?php

declare(strict_types=1);

namespace App\Domains\System\Services;

use App\Domains\Operations\Services\OpsAlertsService;
use App\Models\Order;
use App\Models\SmsLog;
use App\Models\WebhookLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Redis;

class SystemHealthService
{
    public function __construct(
        private readonly SchedulerRunTracker $schedulerRuns = new SchedulerRunTracker,
        private readonly OpsAlertsService $opsAlerts = new OpsAlertsService,
    ) {}

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
            ->get(['id', 'uuid', 'connection', 'queue', 'exception', 'failed_at'])
            ->map(fn ($row) => [
                'id' => (int) $row->id,
                'uuid' => $row->uuid,
                'connection' => $row->connection,
                'queue' => $row->queue,
                'exception_snippet' => $this->exceptionSnippet((string) $row->exception),
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

        $disk = $this->diskHealth();
        $redis = $this->checkRedis();

        $issues = $failedJobs24h + $webhookFailures24h + $paymentPendingStuck + $smsFailed24h;
        if ($printProxy['status'] === 'unreachable') {
            $issues++;
        }
        if ($disk['ok'] === false) {
            $issues++;
        }
        if ($redis['status'] === 'down') {
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
            'disk' => $disk,
            'redis' => $redis,
            'checked_at' => now()->toIso8601String(),
            'recent_failed_jobs' => $recentFailedJobs,
            'recent_webhook_failures' => $recentWebhookFailures,
            'stuck_payment_pending_orders' => $stuckOrders,
            'scheduler_last_runs' => $this->schedulerRuns->getLastRuns(),
            'alert_inbox' => $this->opsAlerts->inbox(),
        ];
    }

    public function retryFailedJob(string $uuid): bool
    {
        $exists = DB::table('failed_jobs')->where('uuid', $uuid)->exists();
        if (!$exists) {
            return false;
        }

        \Illuminate\Support\Facades\Artisan::call('queue:retry', ['id' => [$uuid]]);

        return true;
    }

    public function forgetFailedJob(string $uuid): bool
    {
        $exists = DB::table('failed_jobs')->where('uuid', $uuid)->exists();
        if (!$exists) {
            return false;
        }

        \Illuminate\Support\Facades\Artisan::call('queue:forget', ['id' => $uuid]);

        return true;
    }

    /**
     * Ping Redis. Never throws — reports up / down / degraded.
     *
     * @return array{status: string, ok: bool, latency_ms: float|null, error: string|null}
     */
    private function checkRedis(): array
    {
        $started = microtime(true);

        try {
            $pong = Redis::connection()->ping();
            $latency = round((microtime(true) - $started) * 1000, 1);
            $ok = $pong === true || $pong === 'PONG' || $pong === '+PONG';

            if (! $ok) {
                return [
                    'status' => 'degraded',
                    'ok' => false,
                    'latency_ms' => $latency,
                    'error' => is_string($pong) ? $pong : 'Unexpected PING response',
                ];
            }

            return [
                'status' => $latency > 200 ? 'degraded' : 'up',
                'ok' => true,
                'latency_ms' => $latency,
                'error' => null,
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'down',
                'ok' => false,
                'latency_ms' => null,
                'error' => $e->getMessage(),
            ];
        }
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

    /**
     * @return array{ok: bool|null, free_percent: float|null, free_gb: float|null, path: string}
     */
    private function diskHealth(): array
    {
        $path = (string) (config('backup.backup.destination.disks.0')
            ? storage_path('app')
            : storage_path('app'));

        if (!is_dir($path)) {
            $path = base_path();
        }

        $free = @disk_free_space($path);
        $total = @disk_total_space($path);

        if ($free === false || $total === false || $total <= 0) {
            return [
                'ok' => null,
                'free_percent' => null,
                'free_gb' => null,
                'path' => $path,
            ];
        }

        $freePercent = round(($free / $total) * 100, 1);
        $freeGb = round($free / (1024 ** 3), 2);

        return [
            'ok' => $freePercent >= 10.0,
            'free_percent' => $freePercent,
            'free_gb' => $freeGb,
            'path' => $path,
        ];
    }

    private function exceptionSnippet(string $exception): string
    {
        $line = strtok($exception, "\n") ?: $exception;

        return mb_substr($line, 0, 160);
    }
}
