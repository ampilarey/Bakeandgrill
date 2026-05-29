<?php

declare(strict_types=1);

namespace App\Domains\System\Services;

use Illuminate\Support\Facades\Cache;

class SchedulerRunTracker
{
    private const CACHE_PREFIX = 'scheduler:last_run:';

    public function recordLastRun(string $command): void
    {
        Cache::forever(self::CACHE_PREFIX . $command, now()->toIso8601String());
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
        ];
    }
}
