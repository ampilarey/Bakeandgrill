<?php

declare(strict_types=1);

namespace App\Domains\Shifts\DTOs;

readonly class ShiftOpenedData
{
    public function __construct(
        public int $shiftId,
        public int $userId,
        public string $userName,
        public float $openingCash,
    ) {}
}
