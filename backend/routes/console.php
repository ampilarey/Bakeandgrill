<?php

declare(strict_types=1);

use App\Models\Item;
use Database\Seeders\ImportMenuSeeder;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('menu:sync-item-images', function () {
    $map = ImportMenuSeeder::getLocalImageMap();
    $updated = 0;
    Item::chunk(100, function ($items) use ($map, &$updated) {
        foreach ($items as $item) {
            $nameKey = strtolower(trim($item->name));
            $handleKey = str_replace(' ', '-', $nameKey);
            $imageUrl = $map[$nameKey] ?? $map[$handleKey] ?? $map[str_replace([' ', '/'], ['-', '-'], $nameKey)] ?? null;
            if ($imageUrl !== null && $item->image_url !== $imageUrl) {
                $item->update(['image_url' => $imageUrl]);
                $updated++;
                $this->line("Updated: {$item->name} -> {$imageUrl}");
            }
        }
    });
    $this->info("Synced {$updated} item image(s) from local cafe photos.");
})->purpose('Set image_url for items that have local cafe photos so uploaded photos appear on the website');

/**
 * Helper: builds a generic onFailure handler that logs critical + notifies Sentry.
 * All critical scheduled tasks call this so failures are never silent.
 */
$alertOnFailure = function (string $command): Closure {
    return function () use ($command): void {
        $msg = "Scheduled task FAILED: {$command}";
        Log::critical($msg);
        if (app()->bound('sentry')) {
            \Sentry\captureMessage($msg, Sentry\Severity::error());
        }
    };
};

// Loyalty maintenance schedules
Schedule::command('app:expire-loyalty-holds')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('app:expire-loyalty-holds'));

Schedule::command('app:reconcile-loyalty-balances')
    ->dailyAt('03:00')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('app:reconcile-loyalty-balances'));

// Reservations: auto-mark no-shows every 15 minutes
Schedule::job(App\Jobs\AutoCancelNoShowReservations::class)
    ->everyFifteenMinutes()
    ->onFailure($alertOnFailure('AutoCancelNoShowReservations'));

// Finance: generate recurring expenses daily at 06:00
Schedule::command('expenses:generate-recurring')
    ->dailyAt('06:00')
    ->onFailure($alertOnFailure('expenses:generate-recurring'));

// Finance: mark overdue invoices daily at 07:00
Schedule::command('invoices:mark-overdue')
    ->dailyAt('07:00')
    ->onFailure($alertOnFailure('invoices:mark-overdue'));

// Credit: payment reminder SMS daily at 09:00 (after overdue marking)
Schedule::command('credit:send-payment-reminders')
    ->dailyAt('09:00')
    ->onFailure($alertOnFailure('credit:send-payment-reminders'));

// Inventory: check reorder points daily at 08:00
Schedule::command('inventory:check-reorder')
    ->dailyAt('08:00')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('inventory:check-reorder'));

// Inventory: check expiring items daily at 08:05
Schedule::command('inventory:check-expiry --days=7')
    ->dailyAt('08:05')
    ->onFailure($alertOnFailure('inventory:check-expiry'));

// Housekeeping: prune expired OTP records daily
Schedule::command('otp:prune')
    ->dailyAt('02:00')
    ->onFailure($alertOnFailure('otp:prune'));

// Orders: cancel stale payment_pending orders every 5 minutes
Schedule::command('orders:cancel-stale')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('orders:cancel-stale'));

// SMS: dispatch scheduled/recurring SMS messages every minute
// withoutOverlapping() is important: SmsSchedulerService uses lockForUpdate internally,
// but the outer command itself should not run in parallel to avoid thundering-herd on the lock.
Schedule::command('sms:dispatch-scheduled')
    ->everyMinute()
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('sms:dispatch-scheduled'));

// Payments: alert if any BML webhooks are stuck in failed status (potential missed payments)
Schedule::command('webhooks:check-failed --hours=1')
    ->everyFifteenMinutes()
    ->onFailure($alertOnFailure('webhooks:check-failed'));

// Queue health: alert on any failed_jobs entries in the last hour
Schedule::command('jobs:alert-failed --hours=1')
    ->everyFifteenMinutes()
    ->onFailure($alertOnFailure('jobs:alert-failed'));
