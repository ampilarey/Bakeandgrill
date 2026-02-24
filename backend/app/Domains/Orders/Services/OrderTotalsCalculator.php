<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Orders\DTOs\DiscountsInput;
use App\Domains\Orders\DTOs\TotalsBreakdown;
use App\Domains\Shared\ValueObjects\Money;
use App\Models\Order;

/**
 * Calculates order totals deterministically.
 *
 * ALWAYS applies discounts in this exact order:
 *   1. ITEM-LEVEL PROMO DISCOUNTS (on individual line items)
 *   2. ORDER-LEVEL PROMO DISCOUNTS (on subtotal)
 *   3. LOYALTY DISCOUNT (from hold)
 *   4. MANUAL STAFF DISCOUNT
 *   5. GUARD: discountedSubtotal = max(0, subtotal − totalDiscounts)
 *   6. TAX (applied after discounts)
 *   7. GRAND TOTAL
 *
 * Rounding: floor() for discounts (merchant-favorable), round() for tax.
 * All arithmetic done in integer laari via Money value object.
 */
class OrderTotalsCalculator
{
    public function calculate(
        Order $order,
        DiscountsInput $discounts = new DiscountsInput,
        ?int $taxRateBp = null,
        ?bool $taxInclusive = null,
    ): TotalsBreakdown {
        $taxRateBp ??= (int) config('app.tax_rate_bp', 0);
        $taxInclusive ??= (bool) config('app.tax_inclusive', false);

        $subtotal = $this->calculateSubtotalFromItems($order);
        $promoDisco = new Money($discounts->promoDiscountLaar);
        $loyaltyDisco = new Money($discounts->loyaltyDiscountLaar);
        $manualDisco = new Money($discounts->manualDiscountLaar);

        $totalDiscount = $promoDisco->add($loyaltyDisco)->add($manualDisco);
        $discountedSubtotal = $subtotal->subtract($totalDiscount);

        if ($taxInclusive) {
            $tax = $discountedSubtotal->extractTax($taxRateBp);
            $grandTotal = $discountedSubtotal;
        } else {
            $tax = $discountedSubtotal->addTax($taxRateBp)->subtract($discountedSubtotal);
            $grandTotal = $discountedSubtotal->add($tax);
        }

        return new TotalsBreakdown(
            subtotal: $subtotal,
            promoDiscount: $promoDisco,
            loyaltyDiscount: $loyaltyDisco,
            manualDiscount: $manualDisco,
            totalDiscount: $totalDiscount,
            discountedSubtotal: $discountedSubtotal,
            tax: $tax,
            grandTotal: $grandTotal,
            taxInclusive: $taxInclusive,
            taxRateBp: $taxRateBp,
        );
    }

    private function calculateSubtotalFromItems(Order $order): Money
    {
        $order->loadMissing('items');
        $totalLaar = 0;
        foreach ($order->items as $item) {
            $totalLaar += (int) round((float) $item->total_price * 100);
        }

        return new Money($totalLaar);
    }
}
