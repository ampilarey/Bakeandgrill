<?php

declare(strict_types=1);

use App\Models\Item;
use Database\Seeders\ImportMenuSeeder;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
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

// Loyalty maintenance schedules
Schedule::command('app:expire-loyalty-holds')->everyFifteenMinutes();
Schedule::command('app:reconcile-loyalty-balances')->dailyAt('03:00');

// Reservations: auto-mark no-shows every 15 minutes
Schedule::job(App\Jobs\AutoCancelNoShowReservations::class)->everyFifteenMinutes();

// Finance: generate recurring expenses daily at 06:00
Schedule::command('expenses:generate-recurring')->dailyAt('06:00');

// Finance: mark overdue invoices daily at 07:00
Schedule::command('invoices:mark-overdue')->dailyAt('07:00');

// Inventory: check reorder points daily at 08:00
Schedule::command('inventory:check-reorder')->dailyAt('08:00');

// Inventory: check expiring items daily at 08:05
Schedule::command('inventory:check-expiry --days=7')->dailyAt('08:05');

// Housekeeping: prune expired OTP records daily
Schedule::command('otp:prune')->dailyAt('02:00');
