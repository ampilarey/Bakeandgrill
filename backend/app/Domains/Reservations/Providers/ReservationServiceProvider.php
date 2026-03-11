<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Providers;

use App\Domains\Reservations\Repositories\EloquentReservationRepository;
use App\Domains\Reservations\Repositories\ReservationRepositoryInterface;
use Illuminate\Support\ServiceProvider;

class ReservationServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(ReservationRepositoryInterface::class, EloquentReservationRepository::class);
    }
}
