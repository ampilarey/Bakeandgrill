<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Gst\Services\GstTaxCalculator;
use App\Domains\Orders\DTOs\DiscountsInput;
use App\Domains\Orders\DTOs\ServiceChargeBreakdown;
use App\Domains\Orders\DTOs\TotalsBreakdown;
use App\Domains\Orders\Support\EffectiveDiscount;
use App\Domains\Shared\ValueObjects\Money;
use App\Models\Order;

/**
 * Calculates order totals deterministically using per-item tax rates.
 *
 * Order:
 *   1. Subtotal from line items
 *   2. Order-level discounts (proportionally allocated when stacked above subtotal)
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
        private readonly PackagingFeeCalculator $packagingFeeCalculator = new PackagingFeeCalculator,
        private readonly GstTaxCalculator $gstTax = new GstTaxCalculator,
        private readonly GstSettingsService $gstSettings = new GstSettingsService,
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

    /**
     * Packaging/small-order fees stay editable through payment_pending so
     * online checkout totals remain accurate until payment is confirmed.
     */
    public static function packagingFeesLocked(Order $order): bool
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
        ], true);
    }

    public function calculate(
        Order $order,
        DiscountsInput $discounts = new DiscountsInput,
        ?int $taxRateBp = null,
        ?bool $taxInclusive = null,
        ?ServiceChargeBreakdown $lockedServiceCharge = null,
    ): TotalsBreakdown {
        $taxInclusive ??= $this->gstSettings->taxInclusive();

        $subtotal = $this->calculateSubtotalFromItems($order);
        $allocated = EffectiveDiscount::allocateFromInput($subtotal->amountLaar, $discounts);

        $promoDisco = new Money($allocated['promo']);
        $loyaltyDisco = new Money($allocated['loyalty']);
        $manualDisco = new Money($allocated['manual']);
        $giftCardDisco = new Money($allocated['gift_card']);
        $referralDisco = new Money($allocated['referral']);

        $totalDiscountLaar = array_sum($allocated);
        $totalDiscount = new Money($totalDiscountLaar);
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
                $scTaxLaar = $this->calculateServiceChargeTaxLaar(
                    $order,
                    $subtotal,
                    $discountedSubtotal,
                    $serviceCharge->amountLaar,
                );
                if ($scTaxLaar > 0) {
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
     * Sum active line totals in laari (falls back to unit × qty when
     * total_price was never written).
     */
    public function lineItemsSubtotalLaar(Order $order): int
    {
        $order->unsetRelation('items');
        $order->load('items');

        $totalLaar = 0;
        foreach ($order->items as $item) {
            $line = (float) ($item->total_price ?? 0);
            if ($line <= 0) {
                $line = (float) ($item->unit_price ?? 0) * (float) ($item->quantity ?? 0);
            }
            if ($line > 0) {
                $totalLaar += (int) round($line * 100);
            }
        }

        return $totalLaar;
    }

    /**
     * If the order header total is 0/null but line items still have value
     * (seen after mid-edit relation bugs), recalculate and persist so
     * Send Bill / public invoices cannot SMS "MVR 0.00".
     */
    public function repairZeroTotalFromItems(Order $order): Order
    {
        $lineLaar = $this->lineItemsSubtotalLaar($order);
        $headerLaar = (int) ($order->total_laar ?? round((float) ($order->total ?? 0) * 100));

        if ($lineLaar <= 0 || $headerLaar > 0) {
            return $order->loadMissing(['items.item', 'customer']);
        }

        $order->unsetRelation('items');

        return $this->recalculateAndPersist($order);
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

        $discountedLaar = $breakdown->discountedSubtotal->amountLaar;
        $feesLocked = self::packagingFeesLocked($order);
        $packagingLaar = $feesLocked
            ? (int) ($order->packaging_fee_laar ?? 0)
            : $this->packagingFeeCalculator->calculatePackaging($order, $discountedLaar);
        $smallOrderLaar = $feesLocked
            ? (int) ($order->small_order_fee_laar ?? 0)
            : $this->packagingFeeCalculator->calculateSmallOrder($order, $discountedLaar);
        $deliveryFeeLaar = (int) ($order->delivery_fee_laar ?? 0);
        $tipLaar = (int) round((float) ($order->tip_amount ?? 0) * 100);
        $totalWithExtrasLaar = $breakdown->grandTotal->amountLaar + $packagingLaar + $smallOrderLaar + $deliveryFeeLaar + $tipLaar;

        $order->update(array_merge($breakdown->toOrderAttributes(), [
            'packaging_fee_laar' => $packagingLaar,
            'small_order_fee_laar' => $smallOrderLaar,
            'total_laar' => $totalWithExtrasLaar,
            'total' => round($totalWithExtrasLaar / 100, 2),
        ]));

        return $order->load(['items.modifiers']);
    }

    private function calculateSubtotalFromItems(Order $order): Money
    {
        // Same unit×qty fallback as lineItemsSubtotalLaar — keep one path.
        return new Money($this->lineItemsSubtotalLaar($order));
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
            $itemLaar = (int) round((float) $item->total_price * 100);
            $effectiveLaar = (int) round($itemLaar * $discountRatio);

            if ($effectiveLaar <= 0) {
                continue;
            }

            $taxLaar = $this->gstTax->calculateLineTaxLaar(
                $effectiveLaar,
                $item->tax_code ?? null,
                $taxInclusive,
            );

            $totalTaxLaar += $taxLaar;
        }

        return new Money($totalTaxLaar);
    }

    /**
     * Allocate service charge tax across item tax buckets (not a single blended rate).
     */
    private function calculateServiceChargeTaxLaar(
        Order $order,
        Money $subtotal,
        Money $discountedSubtotal,
        int $serviceChargeLaar,
    ): int {
        if ($serviceChargeLaar <= 0 || $subtotal->amountLaar === 0) {
            return 0;
        }

        $order->loadMissing('items');
        $discountRatio = $discountedSubtotal->amountLaar / $subtotal->amountLaar;

        /** @var array<float, int> $buckets tax rate percent => post-discount laar */
        $buckets = [];
        foreach ($order->items as $item) {
            $rate = $this->gstTax->resolveTaxRatePercent($item->tax_code ?? null);
            if ($rate <= 0) {
                continue;
            }
            $itemLaar = (int) round((float) $item->total_price * 100);
            $effectiveLaar = (int) round($itemLaar * $discountRatio);
            if ($effectiveLaar <= 0) {
                continue;
            }
            $buckets[$rate] = ($buckets[$rate] ?? 0) + $effectiveLaar;
        }

        $totalTaxableLaar = array_sum($buckets);
        if ($totalTaxableLaar <= 0) {
            return 0;
        }

        $scTaxLaar = 0;
        foreach ($buckets as $rate => $bucketLaar) {
            $scShareLaar = (int) round($serviceChargeLaar * $bucketLaar / $totalTaxableLaar);
            $scTaxLaar += (int) round($scShareLaar * $rate / 100);
        }

        return $scTaxLaar;
    }
}
