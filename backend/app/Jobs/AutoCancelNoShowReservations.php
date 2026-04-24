<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domains\Reservations\Services\ReservationService;
use App\Models\ReservationSetting;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;

class AutoCancelNoShowReservations implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 3;
    public int $backoff = 30;
    public int $timeout = 60;

    public function handle(ReservationService $service): void
    {
        $settings = ReservationSetting::current();
        $marked = $service->markNoShows($settings->auto_cancel_minutes);

        if ($marked > 0) {
            Log::info("AutoCancelNoShowReservations: marked {$marked} reservations as no-show.");
        }
    }

    public function failed(\Throwable $exception): void
    {
        Log::error("AutoCancelNoShowReservations job failed: {$exception->getMessage()}");
    }
}
