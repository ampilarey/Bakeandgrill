<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Orders\DTOs\DiscountsInput;
use App\Domains\Orders\DTOs\ServiceChargeBreakdown;
use App\Domains\Orders\DTOs\TotalsBreakdown;
use App\Domains\Shared\ValueObjects\Money;
use App\Models\Order;

/**
 * Calculates order totals deterministically using per-item tax rates.
 *
 * Order:
 *   1. Subtotal from line items
 *   2. Order-level discounts
 *   3. Discounted subtotal
 *   4. Service charge (from settings snapshot, or frozen on locked orders)
 *   5. Per-item tax (+ optional service charge tax)
 *   6. Grand total (items + service charge + tax)
 *   7. Delivery fee added in recalculateAndPersist
 */
class OrderTotalsCalculator
{
    public function __construct(
        private readonly ServiceChargeCalculator $serviceChargeCalculator = new ServiceChargeCalculator,
    ) {}

    public static function orderTotalsLocked(Order $order): bool
    {
        if ($order->payment_status === 'paid') {
            return true;
        }

        return in_array($order->status, [
            'paid',
            'completed',
            'cancelled',
            'refunded',
            'partially_refunded',
            'payment_pending',
        ], true);
    }

    public function calculate(
        Order $order,
        DiscountsInput $discounts = new DiscountsInput,
        ?int $taxRateBp = null,
        ?bool $taxInclusive = null,
        ?ServiceChargeBreakdown $lockedServiceCharge = null,
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

        $serviceCharge = $lockedServiceCharge
            ?? $this->serviceChargeCalculator->calculate($order, $discountedSubtotal->amountLaar);
        $serviceChargeMoney = new Money($serviceCharge->amountLaar);

        if ($taxRateBp !== null) {
            if ($taxInclusive) {
                $tax = $discountedSubtotal->extractTax($taxRateBp);
                $grandTotal = $discountedSubtotal->add($serviceChargeMoney);
            } else {
                $itemTax = $discountedSubtotal->addTax($taxRateBp)->subtract($discountedSubtotal);
                $tax = $itemTax;
                if ($serviceCharge->taxable && $serviceCharge->amountLaar > 0) {
                    $scTax = new Money($serviceCharge->amountLaar)->addTax($taxRateBp)->subtract(new Money($serviceCharge->amountLaar));
                    $tax = $tax->add($scTax);
                }
                $grandTotal = $discountedSubtotal->add($serviceChargeMoney)->add($tax);
            }
            $effectiveTaxRateBp = $taxRateBp;
        } else {
            $tax = $this->calculatePerItemTax($order, $subtotal, $discountedSubtotal, $taxInclusive);

            if ($serviceCharge->taxable && $serviceCharge->amountLaar > 0 && !$taxInclusive) {
                $avgRate = $this->weightedAverageTaxRate($order, $subtotal, $discountedSubtotal);
                if ($avgRate > 0) {
                    $scTaxLaar = (int) round($serviceCharge->amountLaar * $avgRate / 100);
                    $tax = $tax->add(new Money($scTaxLaar));
                }
            }

            if ($taxInclusive) {
                $grandTotal = $discountedSubtotal->add($serviceChargeMoney);
            } else {
                $grandTotal = $discountedSubtotal->add($serviceChargeMoney)->add($tax);
            }

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
            serviceCharge: $serviceCharge,
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

        $lockedServiceCharge = self::orderTotalsLocked($order)
            ? ServiceChargeBreakdown::fromOrderSnapshot($order)
            : null;

        $breakdown = $this->calculate($order, $discounts, lockedServiceCharge: $lockedServiceCharge);

        $deliveryFeeLaar = (int) ($order->delivery_fee_laar ?? 0);
        $totalWithExtrasLaar = $breakdown->grandTotal->amountLaar + $deliveryFeeLaar;

        $order->update(array_merge($breakdown->toOrderAttributes(), [
            'total_laar' => $totalWithExtrasLaar,
            'total' => round($totalWithExtrasLaar / 100, 2),
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

        $discountRatio = $discountedSubtotal->amountLaar / $subtotal->amountLaar;

        $totalTaxLaar = 0;
        foreach ($order->items as $item) {
            $taxRate = (float) $item->tax_rate;
            if ($taxRate <= 0) {
                continue;
            }

            $itemLaar = (int) round((float) $item->total_price * 100);
            $effectiveLaar = (int) round($itemLaar * $discountRatio);

            if ($taxInclusive) {
                $taxLaar = (int) round($effectiveLaar * $taxRate / (100 + $taxRate));
            } else {
                $taxLaar = (int) round($effectiveLaar * $taxRate / 100);
            }

            $totalTaxLaar += $taxLaar;
        }

        return new Money($totalTaxLaar);
    }

    /**
     * Weighted average item tax rate (percent) by post-discount effective laar.
     */
    private function weightedAverageTaxRate(Order $order, Money $subtotal, Money $discountedSubtotal): float
    {
        if ($subtotal->amountLaar === 0) {
            return 0.0;
        }

        $discountRatio = $discountedSubtotal->amountLaar / $subtotal->amountLaar;
        $weightedSum = 0.0;
        $totalEffective = 0;

        foreach ($order->items as $item) {
            $taxRate = (float) $item->tax_rate;
            if ($taxRate <= 0) {
                continue;
            }
            $itemLaar = (int) round((float) $item->total_price * 100);
            $effectiveLaar = (int) round($itemLaar * $discountRatio);
            if ($effectiveLaar <= 0) {
                continue;
            }
            $weightedSum += $effectiveLaar * $taxRate;
            $totalEffective += $effectiveLaar;
        }

        return $totalEffective > 0 ? $weightedSum / $totalEffective : 0.0;
    }
}
