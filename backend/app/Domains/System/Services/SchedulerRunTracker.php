<?php

declare(strict_types=1);

namespace App\Domains\System\Services;

use App\Support\ResilientCache;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SchedulerRunTracker
{
    private const CACHE_PREFIX = 'scheduler:last_run:';

    private const HEARTBEAT_CACHE_KEY = 'scheduler:external_heartbeat:last_ping';

    public function recordLastRun(string $command): void
    {
        ResilientCache::forever(self::CACHE_PREFIX . $command, now()->toIso8601String());
    }

    /**
     * Signal a FAILURE to the external dead-man's switch.
     *
     * Healthchecks.io treats a request to `<url>/fail` as an explicit failure
     * and alerts immediately, rather than waiting for pings to stop.
     *
     * This exists because the plain heartbeat answers the wrong question. On
     * 2026-08-26 Redis died at 03:51 and stayed dead for nineteen hours; the
     * scheduler was fine throughout, so it pinged happily every minute and the
     * monitor stayed green while the queue did nothing at all. "Cron is
     * running" is not "the system can work".
     *
     * Deliberately does NOT record a successful-ping timestamp: the admin
     * probe reads that to say when the monitor last heard good news, and a
     * failure ping is not good news.
     */
    public function pingExternalHeartbeatFailure(string $reason = ''): bool
    {
        $url = trim((string) config('system.healthcheck_url', ''));

        if ($url === '') {
            return false;
        }

        try {
            $response = Http::timeout(5)
                ->withBody($reason, 'text/plain')
                ->post(rtrim($url, '/') . '/fail');

            if (!$response->successful()) {
                Log::warning('Scheduler heartbeat failure ping returned non-success status', [
                    'status' => $response->status(),
                ]);

                return false;
            }

            return true;
        } catch (\Throwable $e) {
            // Never let the monitor's own unreachability break the scheduler.
            Log::warning('Scheduler heartbeat failure ping failed', [
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Ping an optional external dead-man's switch (Healthchecks.io, etc.).
     * No-op when HEALTHCHECK_URL is unset.
     */
    public function pingExternalHeartbeat(): bool
    {
        $url = trim((string) config('system.healthcheck_url', ''));

        if ($url === '') {
            return false;
        }

        try {
            $response = Http::timeout(5)->get($url);

            if (!$response->successful()) {
                Log::warning('Scheduler external heartbeat ping returned non-success status', [
                    'url' => $url,
                    'status' => $response->status(),
                ]);

                return false;
            }

            ResilientCache::forever(self::HEARTBEAT_CACHE_KEY, now()->toIso8601String());

            return true;
        } catch (\Throwable $e) {
            Log::warning('Scheduler external heartbeat ping failed', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    public function lastExternalHeartbeatAt(): ?string
    {
        $value = ResilientCache::get(self::HEARTBEAT_CACHE_KEY);

        return is_string($value) ? $value : null;
    }

    /**
     * @param list<string>|null $commands
     * @return array<string, string|null>
     */
    public function getLastRuns(?array $commands = null): array
    {
        $commands ??= $this->trackedCommands();
        $runs = [];
        foreach ($commands as $command) {
            $runs[$command] = ResilientCache::get(self::CACHE_PREFIX . $command);
        }

        return $runs;
    }

    /**
     * @return list<string>
     */
    public function trackedCommands(): array
    {
        return [
            'app:expire-loyalty-holds',
            'app:expire-loyalty-points',
            'app:reconcile-loyalty-balances',
            'AutoCancelNoShowReservations',
            'ExpireCateringQuotes',
            'SendCateringEventReminders',
            'expenses:generate-recurring',
            'invoices:mark-overdue',
            'credit:send-payment-reminders',
            'inventory:check-reorder',
            'inventory:check-expiry',
            'otp:prune',
            'orders:cancel-stale',
            'sms:dispatch-scheduled',
            'webhooks:check-failed',
            'jobs:alert-failed',
            'marketing:send-birthday-offers',
            'marketing:send-abandoned-cart-reminders',
            'marketing:prune-abandoned-carts',
            'insights:compute-item-pairs',
            'ops:alert-delivery-delays',
            'marketing:send-tier-milestones',
            'backup:clean',
            'backup:run',
            'backup:monitor',
            'scheduler:heartbeat',
        ];
    }
}
