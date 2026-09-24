<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Events;

use App\Models\Reservation;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/** A booking was cancelled by the guest or by staff (ops audit, 2026-09-25). */
class ReservationCancelled
{
    use Dispatchable, SerializesModels;

    public function __construct(public readonly Reservation $reservation, public readonly string $by = 'staff') {}
}
