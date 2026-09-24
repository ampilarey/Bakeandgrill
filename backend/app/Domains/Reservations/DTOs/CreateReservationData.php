<?php

declare(strict_types=1);

namespace App\Domains\Reservations\DTOs;

readonly class CreateReservationData
{
    public function __construct(
        public string $customerName,
        public string $customerPhone,
        public int $partySize,
        public string $date,
        public string $timeSlot,
        public ?string $notes = null,
        public ?int $customerId = null,
        /** Staff booking taken by phone: confirmed on the spot, one text instead of "received" then "confirmed". */
        public bool $confirmed = false,
    ) {}
}
