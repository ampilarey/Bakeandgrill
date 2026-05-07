<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Orders\DTOs\DiscountsInput;
use App\Domains\Orders\DTOs\TotalsBreakdown;
use App\Domains\Shared\ValueObjects\Money;
use App\Models\Order;

/**
 * Calculates order totals deterministically using per-item tax rates.
 *
 * ALWAYS applies discounts in this exact order:
 *   1. ITEM-LEVEL PROMO DISCOUNTS (on individual line items)
 *   2. ORDER-LEVEL PROMO DISCOUNTS (on subtotal)
 *   3. LOYALTY DISCOUNT (from hold)
 *   4. MANUAL STAFF DISCOUNT
 *   5. GUARD: discountedSubtotal = max(0, subtotal − totalDiscounts)
 *   6. TAX (applied proportionally per item — discounts reduce taxable amount)
 *   7. GRAND TOTAL
 *
 * Tax is calculated per order item using the tax_rate snapshotted at order time.
 * When a discount reduces the subtotal, the discount is applied proportionally
 * across items so each item's effective taxable amount is reduced fairly.
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
        $taxInclusive ??= (bool) config('app.tax_inclusive', false);

        $subtotal = $this->calculateSubtotalFromItems($order);
        $promoDisco = new Money($discounts->promoDiscountLaar);
        $loyaltyDisco = new Money($discounts->loyaltyDiscountLaar);
        $manualDisco = new Money($discounts->manualDiscountLaar);
        $giftCardDisco = new Money($discounts->giftCardDiscountLaar);
        $referralDisco = new Money($discounts->referralDiscountLaar);

        $totalDiscount = $promoDisco
            ->add($loyaltyDisco)
            ->add($manualDisco)
            ->add($giftCardDisco)
            ->add($referralDisco);
        $discountedSubtotal = $subtotal->subtract($totalDiscount);

        // Use per-item tax rates from order_items.tax_rate (snapshotted at order time).
        // Falls back to the global TAX_RATE_BP config only when an explicit override is
        // passed — this preserves backward compatibility for any callers that pass taxRateBp.
        if ($taxRateBp !== null) {
            // Legacy / explicit override path: global rate on whole subtotal.
            if ($taxInclusive) {
                $tax = $discountedSubtotal->extractTax($taxRateBp);
                $grandTotal = $discountedSubtotal;
            } else {
                $tax = $discountedSubtotal->addTax($taxRateBp)->subtract($discountedSubtotal);
                $grandTotal = $discountedSubtotal->add($tax);
            }
            $effectiveTaxRateBp = $taxRateBp;
        } else {
            // Per-item tax path: each item taxed at its own rate.
            $tax = $this->calculatePerItemTax($order, $subtotal, $discountedSubtotal, $taxInclusive);

            if ($taxInclusive) {
                $grandTotal = $discountedSubtotal;
            } else {
                $grandTotal = $discountedSubtotal->add($tax);
            }

            // Store 0 in tax_rate_bp on the order since there is no single rate.
            $effectiveTaxRateBp = 0;
        }

        return new TotalsBreakdown(
            subtotal: $subtotal,
            promoDiscount: $promoDisco,
            loyaltyDiscount: $loyaltyDisco,
            manualDiscount: $manualDisco,
            giftCardDiscount: $giftCardDisco,
            referralDiscount: $referralDisco,
            totalDiscount: $totalDiscount,
            discountedSubtotal: $discountedSubtotal,
            tax: $tax,
            grandTotal: $grandTotal,
            taxInclusive: $taxInclusive,
            taxRateBp: $effectiveTaxRateBp,
        );
    }

    /**
     * Recalculate all total fields from the order's current state and persist them.
     */
    public function recalculateAndPersist(Order $order): Order
    {
        $discounts = new DiscountsInput(
            promoDiscountLaar: (int) ($order->promo_discount_laar ?? 0),
            loyaltyDiscountLaar: (int) ($order->loyalty_discount_laar ?? 0),
            manualDiscountLaar: (int) ($order->manual_discount_laar ?? 0),
            giftCardDiscountLaar: (int) ($order->gift_card_discount_laar ?? 0),
            referralDiscountLaar: (int) ($order->referral_discount_laar ?? 0),
        );

        $breakdown = $this->calculate($order, $discounts);

        // Delivery fee is tracked separately and added on top of the item grand total.
        $deliveryFeeLaar = (int) ($order->delivery_fee_laar ?? 0);
        $totalWithDeliveryLaar = $breakdown->grandTotal->amountLaar + $deliveryFeeLaar;

        $order->update(array_merge($breakdown->toOrderAttributes(), [
            'total_laar' => $totalWithDeliveryLaar,
            'total' => round($totalWithDeliveryLaar / 100, 2),
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

    /**
     * Calculate tax by applying each item's own tax_rate to its proportional share
     * of the discounted subtotal.
     *
     * When a discount reduces the order total, it is spread proportionally across
     * items so that each item's taxable amount is reduced fairly before applying
     * the item's own tax rate.
     */
    private function calculatePerItemTax(
        Order $order,
        Money $subtotal,
        Money $discountedSubtotal,
        bool $taxInclusive,
    ): Money {
        $order->loadMissing('items');

        if ($subtotal->amountLaar === 0) {
            return new Money(0);
        }

        // Ratio of discounted subtotal to original subtotal (how much of each laari survives after discounts).
        $discountRatio = $discountedSubtotal->amountLaar / $subtotal->amountLaar;

        $totalTaxLaar = 0;
        foreach ($order->items as $item) {
            $taxRate = (float) $item->tax_rate;
            if ($taxRate <= 0) {
                continue;
            }

            $itemLaar = (int) round((float) $item->total_price * 100);
            // Apply discount proportionally to this item's price.
            $effectiveLaar = (int) round($itemLaar * $discountRatio);

            if ($taxInclusive) {
                // Extract the tax already baked into the price: tax = price * rate / (100 + rate)
                $taxLaar = (int) round($effectiveLaar * $taxRate / (100 + $taxRate));
            } else {
                // Add tax on top: tax = price * rate / 100
                $taxLaar = (int) round($effectiveLaar * $taxRate / 100);
            }

            $totalTaxLaar += $taxLaar;
        }

        return new Money($totalTaxLaar);
    }
}
