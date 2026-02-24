<?php

declare(strict_types=1);

namespace App\Domains\Orders\DTOs;

use App\Domains\Shared\ValueObjects\Money;

/**
 * Result DTO from OrderTotalsCalculator.
 * All amounts in both float MVR and integer laari for convenience.
 */
final readonly class TotalsBreakdown
{
    public function __construct(
        public Money $subtotal,
        public Money $promoDiscount,
        public Money $loyaltyDiscount,
        public Money $manualDiscount,
        public Money $totalDiscount,
        public Money $discountedSubtotal,
        public Money $tax,
        public Money $grandTotal,
        public bool $taxInclusive,
        public int $taxRateBp,
    ) {}

    public function toOrderAttributes(): array
    {
        return [
            'subtotal' => $this->subtotal->toMvr(),
            'tax_amount' => $this->tax->toMvr(),
            'discount_amount' => $this->totalDiscount->toMvr(),
            'total' => $this->grandTotal->toMvr(),
            'subtotal_laar' => $this->subtotal->amountLaar,
            'tax_laar' => $this->tax->amountLaar,
            'promo_discount_laar' => $this->promoDiscount->amountLaar,
            'loyalty_discount_laar' => $this->loyaltyDiscount->amountLaar,
            'manual_discount_laar' => $this->manualDiscount->amountLaar,
            'total_laar' => $this->grandTotal->amountLaar,
            'tax_inclusive' => $this->taxInclusive,
            'tax_rate_bp' => $this->taxRateBp,
        ];
    }
}
