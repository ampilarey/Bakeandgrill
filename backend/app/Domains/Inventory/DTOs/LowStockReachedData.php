<?php

declare(strict_types=1);

namespace App\Domains\Inventory\DTOs;

readonly class LowStockReachedData
{
    public function __construct(
        public int $itemId,
        public string $itemName,
        public float $currentStock,
        public float $threshold,
    ) {}
}
