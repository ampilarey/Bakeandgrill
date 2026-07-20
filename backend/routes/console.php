<?php

declare(strict_types=1);

use App\Domains\System\Services\SchedulerRunTracker;
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

$trackSuccess = function (string $command): Closure {
    return function () use ($command): void {
        app(SchedulerRunTracker::class)->recordLastRun($command);
    };
};

// Loyalty maintenance schedules
Schedule::command('app:expire-loyalty-holds')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('app:expire-loyalty-holds'))
    ->after($trackSuccess('app:expire-loyalty-holds'));

Schedule::command('app:expire-loyalty-points')
    ->dailyAt('02:30')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('app:expire-loyalty-points'))
    ->after($trackSuccess('app:expire-loyalty-points'));

Schedule::command('app:reconcile-loyalty-balances')
    ->dailyAt('03:00')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('app:reconcile-loyalty-balances'))
    ->after($trackSuccess('app:reconcile-loyalty-balances'));

// Reservations: auto-mark no-shows every 15 minutes
Schedule::job(App\Jobs\AutoCancelNoShowReservations::class)
    ->everyFifteenMinutes()
    ->onFailure($alertOnFailure('AutoCancelNoShowReservations'))
    ->after($trackSuccess('AutoCancelNoShowReservations'));

// Catering: expire awaiting_customer quotes past quote_expires_at
Schedule::job(App\Jobs\ExpireCateringQuotes::class)
    ->hourly()
    ->onFailure($alertOnFailure('ExpireCateringQuotes'))
    ->after($trackSuccess('ExpireCateringQuotes'));

// Catering: day-before reminder for confirmed events
Schedule::job(App\Jobs\SendCateringEventReminders::class)
    ->dailyAt('09:30')
    ->onFailure($alertOnFailure('SendCateringEventReminders'))
    ->after($trackSuccess('SendCateringEventReminders'));

// Finance: generate recurring expenses daily at 06:00
Schedule::command('expenses:generate-recurring')
    ->dailyAt('06:00')
    ->onFailure($alertOnFailure('expenses:generate-recurring'))
    ->after($trackSuccess('expenses:generate-recurring'));

// Finance: mark overdue invoices daily at 07:00
Schedule::command('invoices:mark-overdue')
    ->dailyAt('07:00')
    ->onFailure($alertOnFailure('invoices:mark-overdue'))
    ->after($trackSuccess('invoices:mark-overdue'));

// Credit: payment reminder SMS daily at 09:00 (after overdue marking)
Schedule::command('credit:send-payment-reminders')
    ->dailyAt('09:00')
    ->onFailure($alertOnFailure('credit:send-payment-reminders'))
    ->after($trackSuccess('credit:send-payment-reminders'));

// Inventory: check reorder points daily at 08:00
Schedule::command('inventory:check-reorder')
    ->dailyAt('08:00')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('inventory:check-reorder'))
    ->after($trackSuccess('inventory:check-reorder'));

// Inventory: check expiring items daily at 08:05
Schedule::command('inventory:check-expiry --days=7')
    ->dailyAt('08:05')
    ->onFailure($alertOnFailure('inventory:check-expiry'))
    ->after($trackSuccess('inventory:check-expiry'));

// Housekeeping: prune expired OTP records daily
Schedule::command('otp:prune')
    ->dailyAt('02:00')
    ->onFailure($alertOnFailure('otp:prune'))
    ->after($trackSuccess('otp:prune'));

// Orders: cancel stale payment_pending orders every 5 minutes
Schedule::command('orders:cancel-stale')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('orders:cancel-stale'))
    ->after($trackSuccess('orders:cancel-stale'));

// SMS: dispatch scheduled/recurring SMS messages every minute
Schedule::command('sms:dispatch-scheduled')
    ->everyMinute()
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('sms:dispatch-scheduled'))
    ->after($trackSuccess('sms:dispatch-scheduled'));

// Payments: alert if any BML webhooks are stuck in failed status (potential missed payments)
Schedule::command('webhooks:check-failed --hours=1')
    ->everyFifteenMinutes()
    ->onFailure($alertOnFailure('webhooks:check-failed'))
    ->after($trackSuccess('webhooks:check-failed'));

// Queue health: alert on any failed_jobs entries in the last hour
Schedule::command('jobs:alert-failed --hours=1')
    ->everyFifteenMinutes()
    ->onFailure($alertOnFailure('jobs:alert-failed'))
    ->after($trackSuccess('jobs:alert-failed'));

// Marketing automation
Schedule::command('marketing:send-birthday-offers')
    ->dailyAt('08:30')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('marketing:send-birthday-offers'))
    ->after($trackSuccess('marketing:send-birthday-offers'));

Schedule::command('marketing:send-abandoned-cart-reminders')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('marketing:send-abandoned-cart-reminders'))
    ->after($trackSuccess('marketing:send-abandoned-cart-reminders'));

Schedule::command('marketing:prune-abandoned-carts')
    ->dailyAt('03:30')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('marketing:prune-abandoned-carts'))
    ->after($trackSuccess('marketing:prune-abandoned-carts'));

Schedule::command('insights:compute-item-pairs')
    ->dailyAt('04:00')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('insights:compute-item-pairs'))
    ->after($trackSuccess('insights:compute-item-pairs'));

Schedule::command('ops:alert-delivery-delays')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('ops:alert-delivery-delays'))
    ->after($trackSuccess('ops:alert-delivery-delays'));

Schedule::command('marketing:send-tier-milestones')
    ->dailyAt('09:00')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('marketing:send-tier-milestones'))
    ->after($trackSuccess('marketing:send-tier-milestones'));

// Database + upload backups (spatie/laravel-backup)
Schedule::command('backup:clean')
    ->dailyAt('01:00')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('backup:clean'))
    ->after($trackSuccess('backup:clean'));

Schedule::command('backup:run')
    ->dailyAt('01:30')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('backup:run'))
    ->after($trackSuccess('backup:run'));

Schedule::command('backup:monitor')
    ->dailyAt('02:00')
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('backup:monitor'))
    ->after($trackSuccess('backup:monitor'));

// External dead-man's switch — pings HEALTHCHECK_URL when configured
Schedule::command('scheduler:heartbeat')
    ->everyMinute()
    ->withoutOverlapping()
    ->onFailure($alertOnFailure('scheduler:heartbeat'))
    ->after($trackSuccess('scheduler:heartbeat'));

// Horizon metrics snapshots (requires `php artisan horizon` worker)
Schedule::command('horizon:snapshot')
    ->everyFiveMinutes();
