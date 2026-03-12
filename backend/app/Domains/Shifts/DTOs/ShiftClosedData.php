<?php

declare(strict_types=1);

namespace App\Domains\Shifts\DTOs;

readonly class ShiftClosedData
{
    public function __construct(
        public int $shiftId,
        public int $userId,
        public string $userName,
        public float $expectedCash,
        public float $actualCash,
        public float $variance,
        public int $orderCount,
        public float $totalRevenue,
    ) {}
}
