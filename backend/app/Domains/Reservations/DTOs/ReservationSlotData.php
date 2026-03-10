<?php

declare(strict_types=1);

namespace App\Domains\Reservations\DTOs;

readonly class ReservationSlotData
{
    public function __construct(
        public string $timeSlot,
        public bool   $available,
        public int    $remainingCapacity,
    ) {}
}
