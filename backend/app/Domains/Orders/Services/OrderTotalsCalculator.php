<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Delivery\Services\DeliveryFeeCalculator;
use App\Domains\Gst\Services\GstSettingsService;
use App\Domains\Gst\Services\GstTaxCalculator;
use App\Domains\Orders\DTOs\DiscountsInput;
use App\Domains\Orders\DTOs\ServiceChargeBreakdown;
use App\Domains\Orders\DTOs\TotalsBreakdown;
use App\Domains\Orders\Support\DiscountSettings;
use App\Domains\Orders\Support\EffectiveDiscount;
use App\Domains\Shared\ValueObjects\Money;
use App\Models\Order;
use App\Models\OrderPromotion;
use App\Support\LaariConverter;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

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
 *   7. Packaging, small-order and delivery fees added in recalculateAndPersist,
 *      each taxed when its site setting says so (tips never are)
 */
class OrderTotalsCalculator
{
    public function __construct(
        private readonly ServiceChargeCalculator $serviceChargeCalculator = new ServiceChargeCalculator,
        private readonly PackagingFeeCalculator $packagingFeeCalculator = new PackagingFeeCalculator,
        private readonly GstTaxCalculator $gstTax = new GstTaxCalculator,
        private readonly GstSettingsService $gstSettings = new GstSettingsService,
        private readonly OrderFeeTaxCalculator $feeTax = new OrderFeeTaxCalculator,
    ) {}

    /**
     * Service charge stays editable through payment_pending — mirroring
     * packagingFeesLocked below — so customer online orders (incl. prepaid
     * dine-in) snapshot a real SC at create instead of freezing a zero from
     * the brand-new row. Once payment_status is 'paid' the snapshot is final.
     */
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
        $parts = EffectiveDiscount::partsFromDiscountsInput($discounts);
        $parts = $this->clampMerchandiseToMarginFloor($order, $parts);
        $allocated = EffectiveDiscount::allocate($subtotal->amountLaar, $parts);

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
                // Inclusive: extract embedded GST from merchandise (+ taxable SC).
                // Do not add tax on top of grand total — it is already embedded.
                $tax = $discountedSubtotal->extractTax($taxRateBp);
                if ($serviceCharge->taxable && $serviceCharge->amountLaar > 0) {
                    $scTax = (new Money($serviceCharge->amountLaar))->extractTax($taxRateBp);
                    $tax = $tax->add($scTax);
                }
                $grandTotal = $discountedSubtotal->add($serviceChargeMoney);
            } else {
                $itemTax = $discountedSubtotal->addTax($taxRateBp)->subtract($discountedSubtotal);
                $tax = $itemTax;
                if ($serviceCharge->taxable && $serviceCharge->amountLaar > 0) {
                    $scTax = (new Money($serviceCharge->amountLaar))->addTax($taxRateBp)->subtract(new Money($serviceCharge->amountLaar));
                    $tax = $tax->add($scTax);
                }
                $grandTotal = $discountedSubtotal->add($serviceChargeMoney)->add($tax);
            }
            $effectiveTaxRateBp = $taxRateBp;
        } else {
            $tax = $this->calculatePerItemTax($order, $subtotal, $discountedSubtotal, $taxInclusive);

            // Inclusive + taxable SC: extract embedded GST into tax_laar only
            // (mirrors packaging fees in recalculateAndPersist). Exclusive: add
            // SC tax into tax_laar and grand total below.
            if ($serviceCharge->taxable && $serviceCharge->amountLaar > 0) {
                $scTaxLaar = $this->calculateServiceChargeTaxLaar(
                    $order,
                    $subtotal,
                    $discountedSubtotal,
                    $serviceCharge->amountLaar,
                    $taxInclusive,
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
        // Prefer already-loaded / setRelation items (preview + unit tests).
        // Only hit the DB when the relation was never loaded.
        if (!$order->relationLoaded('items')) {
            $order->load('items');
        }

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
        // Gift-card purchase orders have no line items — the "amount" IS the
        // total, and the whole tax/service/discount pipeline doesn't apply.
        // Recalculating would clobber subtotal / total (currently written by
        // GiftCardPurchaseService) with 0 and break BML checkout.
        if (($order->type ?? '') === 'gift_card') {
            return $order->loadMissing(['items.modifiers']);
        }

        // Gift cards are tender (payment), not pre-tax discounts — keep the
        // reserved amount on the order but never feed it into tax allocation.
        $giftCardTenderLaar = max(0, (int) ($order->gift_card_discount_laar ?? 0));

        $discounts = new DiscountsInput(
            promoDiscountLaar: (int) ($order->promo_discount_laar ?? 0),
            loyaltyDiscountLaar: (int) ($order->loyalty_discount_laar ?? 0),
            manualDiscountLaar: (int) ($order->manual_discount_laar ?? 0),
            giftCardDiscountLaar: 0,
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

        // Free-delivery threshold uses discounted merchandise (true discounts only).
        $deliveryFeeLaar = (int) ($order->delivery_fee_laar ?? 0);
        $island = trim((string) ($order->delivery_island ?? ''));
        if (!$feesLocked && ($order->type ?? '') === 'delivery' && $island !== '') {
            $deliveryFeeLaar = app(DeliveryFeeCalculator::class)->calculateLaar($island, $discountedLaar);

            // Promo-driven free delivery (type free_delivery / waive_delivery flag).
            $waiveDelivery = OrderPromotion::query()
                ->where('order_id', $order->id)
                ->whereIn('status', ['draft', 'consumed'])
                ->whereHas('promotion', function ($q): void {
                    $q->where('type', 'free_delivery')
                        ->orWhere('waive_delivery', true);
                })
                ->exists();
            if ($waiveDelivery) {
                $deliveryFeeLaar = 0;
            }
        }

        $tipLaar = (int) round((float) ($order->tip_amount ?? 0) * 100);

        $attrs = $breakdown->toOrderAttributes();
        // Preserve soft-held gift-card tender; breakdown intentionally zeros it.
        $attrs['gift_card_discount_laar'] = $giftCardTenderLaar;

        // GST on the fees (packaging, small-order, delivery — each with its own
        // site setting). Exclusive: add the fee GST into tax_laar and the grand
        // total. Inclusive: the fees already embed GST, so extract it into
        // tax_laar only and leave the total alone. The tip is never taxed —
        // it is not consideration for a supply.
        $taxInclusive = $this->gstSettings->taxInclusive();
        $feeTax = $this->feeTax->calculate(
            $packagingLaar,
            $smallOrderLaar,
            $deliveryFeeLaar,
            $taxInclusive,
        );
        $feeTaxLaar = $feeTax['tax_laar'];
        if ($feeTaxLaar > 0) {
            $attrs['tax_laar'] = (int) ($attrs['tax_laar'] ?? 0) + $feeTaxLaar;
            $attrs['tax_amount'] = round(((int) $attrs['tax_laar']) / 100, 2);
        }

        $totalWithExtrasLaar = $breakdown->grandTotal->amountLaar
            + $packagingLaar
            + $smallOrderLaar
            + $deliveryFeeLaar
            + $tipLaar;
        if (!$taxInclusive && $feeTaxLaar > 0) {
            $totalWithExtrasLaar += $feeTaxLaar;
        }

        $order->update(array_merge($attrs, [
            'packaging_fee_laar' => $packagingLaar,
            'small_order_fee_laar' => $smallOrderLaar,
            'delivery_fee_laar' => $deliveryFeeLaar,
            'delivery_fee' => round($deliveryFeeLaar / 100, 2),
            'total_laar' => $totalWithExtrasLaar,
            'total' => round($totalWithExtrasLaar / 100, 2),
        ]));

        return $order->load(['items.modifiers']);
    }

    /**
     * Final order-level margin floor: clamp promo+manual+loyalty+referral so the
     * stacked merchandise discount cannot push lines with a known cost below
     * cost × (1 + floor%). Gift-card tender is excluded (payment, not discount).
     *
     * @param  array{promo: int, loyalty: int, manual: int, gift_card: int, referral: int}  $parts
     * @return array{promo: int, loyalty: int, manual: int, gift_card: int, referral: int}
     */
    private function clampMerchandiseToMarginFloor(Order $order, array $parts): array
    {
        // Avoid SiteSetting::hasScopeColumn() static cache poisoning when the
        // unit suite runs without migrations (no site_settings table yet).
        if (!Schema::hasTable('site_settings')) {
            return $parts;
        }

        try {
            $enabled = DiscountSettings::marginFloorEnabled();
        } catch (\Throwable) {
            return $parts;
        }
        if (!$enabled) {
            return $parts;
        }

        $giftCard = (int) ($parts['gift_card'] ?? 0);
        // Exclude gift_card from this map so proportional remainder stays on merchandise.
        $merchandise = [
            'promo' => (int) ($parts['promo'] ?? 0),
            'loyalty' => (int) ($parts['loyalty'] ?? 0),
            'manual' => (int) ($parts['manual'] ?? 0),
            'referral' => (int) ($parts['referral'] ?? 0),
        ];
        $merchSum = array_sum($merchandise);
        if ($merchSum <= 0) {
            return $parts;
        }

        $maxDiscountable = $this->maxMerchandiseDiscountUnderMarginFloor($order);
        if ($merchSum <= $maxDiscountable) {
            return $parts;
        }

        $clampedMerch = EffectiveDiscount::allocate($maxDiscountable, $merchandise);
        Log::info('Order merchandise discount clamped by margin floor', [
            'order_id' => $order->id,
            'requested_laar' => $merchSum,
            'clamped_laar' => $maxDiscountable,
            'floor_pct' => DiscountSettings::marginFloorPct(),
        ]);

        return [
            'promo' => (int) ($clampedMerch['promo'] ?? 0),
            'loyalty' => (int) ($clampedMerch['loyalty'] ?? 0),
            'manual' => (int) ($clampedMerch['manual'] ?? 0),
            'gift_card' => $giftCard,
            'referral' => (int) ($clampedMerch['referral'] ?? 0),
        ];
    }

    /**
     * Max merchandise discount (laari) that keeps every known-cost line at or
     * above cost×(1+floor%). Lines with cost ≤ 0 (unknown) impose no floor and
     * contribute their full line total to the allowance.
     */
    private function maxMerchandiseDiscountUnderMarginFloor(Order $order): int
    {
        $order->loadMissing('items.item');
        $floorPct = DiscountSettings::marginFloorPct();
        $max = 0;

        foreach ($order->items as $line) {
            $qty = max(1, (int) ($line->quantity ?? 1));
            $lineTotal = (float) ($line->total_price ?? 0);
            if ($lineTotal <= 0) {
                $lineTotal = (float) ($line->unit_price ?? 0) * $qty;
            }
            $lineTotalLaar = LaariConverter::toLaar($lineTotal);
            if ($lineTotalLaar <= 0) {
                continue;
            }

            $costMvr = (float) ($line->item?->cost ?? 0);
            if ($costMvr <= 0) {
                // Unknown cost — no floor on this line.
                $max += $lineTotalLaar;

                continue;
            }

            $floorUnitLaar = (int) ceil($costMvr * (1 + $floorPct / 100) * 100);
            $minLineLaar = $floorUnitLaar * $qty;
            $max += max(0, $lineTotalLaar - $minLineLaar);
        }

        return $max;
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
     * Allocate service charge tax across item tax-code buckets (not a single blended rate).
     * Inclusive: extract embedded GST via GstTaxCalculator (do not add to grand total).
     * Exclusive: GST on top of the SC principal.
     */
    private function calculateServiceChargeTaxLaar(
        Order $order,
        Money $subtotal,
        Money $discountedSubtotal,
        int $serviceChargeLaar,
        bool $taxInclusive,
    ): int {
        if ($serviceChargeLaar <= 0 || $subtotal->amountLaar === 0) {
            return 0;
        }

        $order->loadMissing('items');
        $discountRatio = $discountedSubtotal->amountLaar / $subtotal->amountLaar;

        /** @var array<string, int> $buckets tax_code => post-discount laar */
        $buckets = [];
        foreach ($order->items as $item) {
            $code = $item->tax_code ?? null;
            if ($this->gstTax->resolveTaxRatePercent($code) <= 0) {
                continue;
            }
            $codeValue = $this->gstTax->resolveTaxCode($code)->value;
            $itemLaar = (int) round((float) $item->total_price * 100);
            $effectiveLaar = (int) round($itemLaar * $discountRatio);
            if ($effectiveLaar <= 0) {
                continue;
            }
            $buckets[$codeValue] = ($buckets[$codeValue] ?? 0) + $effectiveLaar;
        }

        $totalTaxableLaar = array_sum($buckets);
        if ($totalTaxableLaar <= 0) {
            return 0;
        }

        $scTaxLaar = 0;
        foreach ($buckets as $taxCode => $bucketLaar) {
            $scShareLaar = (int) round($serviceChargeLaar * $bucketLaar / $totalTaxableLaar);
            $scTaxLaar += $this->gstTax->calculateLineTaxLaar($scShareLaar, $taxCode, $taxInclusive);
        }

        return $scTaxLaar;
    }
}
