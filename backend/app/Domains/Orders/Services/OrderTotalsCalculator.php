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

    /**
     * Recalculate all total fields from the order's current state and persist them.
     *
     * Delegates to calculate() so both paths share the same tax logic:
     * discounts are applied first, tax is calculated on the discounted subtotal,
     * and all arithmetic is done in integer laari via the Money value object.
     * Delivery fee (if any) is added on top of the calculated grand total.
     */
    public function recalculateAndPersist(Order $order): Order
    {
        $discounts = new DiscountsInput(
            promoDiscountLaar: (int) ($order->promo_discount_laar ?? 0),
            loyaltyDiscountLaar: (int) ($order->loyalty_discount_laar ?? 0),
            manualDiscountLaar: (int) ($order->manual_discount_laar ?? 0),
            giftCardDiscountLaar: (int) ($order->gift_card_discount_laar ?? 0),
        );

        $breakdown = $this->calculate($order, $discounts);

        // Delivery fee is tracked separately and added on top of the item grand total.
        $deliveryFeeLaar = (int) ($order->delivery_fee_laar ?? 0);
        $totalWithDeliveryLaar = $breakdown->grandTotal->amountLaar + $deliveryFeeLaar;

        $order->update(array_merge($breakdown->toOrderAttributes(), [
            'total_laar' => $totalWithDeliveryLaar,
            'total'      => round($totalWithDeliveryLaar / 100, 2),
        ]));

        return $order->load(['items.modifiers']);
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
