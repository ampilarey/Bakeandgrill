<?php

declare(strict_types=1);

namespace App\Domains\Orders\DTOs;

/**
 * Input DTO for the OrderTotalsCalculator.
 * All discount amounts are in laari (integer).
 */
final readonly class DiscountsInput
{
    public function __construct(
        public int $promoDiscountLaar = 0,
        public int $loyaltyDiscountLaar = 0,
        public int $manualDiscountLaar = 0,
    ) {}

    public static function none(): self
    {
        return new self;
    }

    public function totalDiscountLaar(): int
    {
        return $this->promoDiscountLaar + $this->loyaltyDiscountLaar + $this->manualDiscountLaar;
    }
}
