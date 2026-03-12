<?php

declare(strict_types=1);

namespace App\Domains\Inventory\DTOs;

readonly class StockLevelChangedData
{
    public function __construct(
        public int $itemId,
        public string $itemName,
        public float $oldQuantity,
        public float $newQuantity,
        public string $reason, // 'sale', 'adjustment', 'purchase', 'waste', 'stock_count'
    ) {}
}
