<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\WebhookLog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Detects BML webhook_logs rows stuck in 'failed' status and reports them.
 *
 * A 'failed' BML webhook means a customer may have paid but their order was
 * not confirmed — the order stays at payment_pending and the customer is stuck.
 *
 * Run via scheduler: Schedule::command('webhooks:check-failed')->everyFifteenMinutes()
 *
 * When SENTRY_LARAVEL_DSN is configured, failures are automatically captured
 * by Sentry. This command additionally logs a critical message that can trigger
 * an external alert (e.g. log-based alerting in your hosting panel).
 */
class CheckFailedWebhooks extends Command
{
    protected $signature = 'webhooks:check-failed
                            {--hours=1 : How far back to look for failed webhooks}';

    protected $description = 'Alert on BML webhook_logs rows stuck in failed status (potential missed payments)';

    public function handle(): int
    {
        $hours = (int) $this->option('hours');
        $since = now()->subHours($hours);

        $failed = WebhookLog::where('gateway', 'bml')
            ->where('status', 'failed')
            ->where('created_at', '>=', $since)
            ->get(['id', 'idempotency_key', 'event_type', 'error_message', 'created_at']);

        if ($failed->isEmpty()) {
            $this->info('No failed BML webhooks in the last ' . $hours . ' hour(s).');
            return self::SUCCESS;
        }

        $count = $failed->count();

        // Log at CRITICAL so any log-based alerting triggers immediately
        Log::critical("CheckFailedWebhooks: {$count} failed BML webhook(s) in the last {$hours}h — potential missed payments", [
            'count'    => $count,
            'webhooks' => $failed->map(fn ($w) => [
                'id'              => $w->id,
                'idempotency_key' => $w->idempotency_key,
                'event_type'      => $w->event_type,
                'error_message'   => $w->error_message,
                'created_at'      => $w->created_at,
            ])->toArray(),
        ]);

        // Sentry: report as an exception so it shows up in the issue tracker
        if (app()->bound('sentry')) {
            \Sentry\captureMessage(
                "[ALERT] {$count} failed BML webhook(s) — check webhook_logs table for missed payments",
                \Sentry\Severity::error(),
            );
        }

        $this->error("{$count} failed BML webhook(s) found — check webhook_logs and confirm payment status in BML portal.");
        $this->table(
            ['ID', 'Idempotency Key', 'Event Type', 'Error', 'Created At'],
            $failed->map(fn ($w) => [
                $w->id,
                $w->idempotency_key,
                $w->event_type,
                mb_substr($w->error_message ?? '—', 0, 60),
                $w->created_at,
            ])->toArray(),
        );

        return self::FAILURE;
    }
}
