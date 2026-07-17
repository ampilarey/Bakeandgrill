<?php

declare(strict_types=1);

namespace App\Domains\System\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SchedulerRunTracker
{
    private const CACHE_PREFIX = 'scheduler:last_run:';

    private const HEARTBEAT_CACHE_KEY = 'scheduler:external_heartbeat:last_ping';

    public function recordLastRun(string $command): void
    {
        Cache::forever(self::CACHE_PREFIX . $command, now()->toIso8601String());
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

            Cache::forever(self::HEARTBEAT_CACHE_KEY, now()->toIso8601String());

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
        $value = Cache::get(self::HEARTBEAT_CACHE_KEY);

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
            $runs[$command] = Cache::get(self::CACHE_PREFIX . $command);
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
