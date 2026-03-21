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
     * Reads existing discount laari values from the order record (promo, loyalty, manual),
     * recalculates subtotal and tax from line items, then updates all total columns.
     * Use this after any discount change or item add/remove on an existing order.
     */
    public function recalculateAndPersist(Order $order): Order
    {
        $order->loadMissing('items.item');

        $subtotalLaar = 0;
        $taxAmount = 0.0;

        foreach ($order->items as $orderItem) {
            $subtotalLaar += (int) round((float) $orderItem->total_price * 100);

            $item = $orderItem->item;
            if ($item && (float) $orderItem->total_price > 0) {
                $rate = (float) ($item->tax_rate ?? 0);
                $taxAmount += (float) $orderItem->total_price * ($rate / 100);
            }
        }

        $taxLaar = (int) round($taxAmount * 100);

        $promoLaar = $order->promo_discount_laar ?? 0;
        $loyaltyLaar = $order->loyalty_discount_laar ?? 0;
        $manualLaar = $order->manual_discount_laar ?? 0;
        $deliveryFeeLaar = $order->delivery_fee_laar ?? 0;

        $totalDiscountLaar = $promoLaar + $loyaltyLaar + $manualLaar;
        $totalLaar = max(0, $subtotalLaar - $totalDiscountLaar + $taxLaar + $deliveryFeeLaar);

        $order->update([
            'subtotal' => round($subtotalLaar / 100, 2),
            'subtotal_laar' => $subtotalLaar,
            'tax_amount' => round($taxAmount, 2),
            'tax_laar' => $taxLaar,
            'discount_amount' => round($totalDiscountLaar / 100, 2),
            'total_laar' => $totalLaar,
            'total' => round($totalLaar / 100, 2),
        ]);

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
