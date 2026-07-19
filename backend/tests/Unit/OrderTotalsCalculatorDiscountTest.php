<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Orders\DTOs\DiscountsInput;
use App\Domains\Orders\DTOs\ServiceChargeBreakdown;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Models\Order;
use App\Models\OrderItem;
use Tests\TestCase;

class OrderTotalsCalculatorDiscountTest extends TestCase
{
    public function test_stacked_discounts_are_allocated_before_tax_base(): void
    {
        $order = new Order;
        $order->setRelation('items', collect([
            $this->lineItem(6.00, 'TGST'),
        ]));

        $calculator = new OrderTotalsCalculator;
        $breakdown = $calculator->calculate(
            $order,
            new DiscountsInput(
                promoDiscountLaar: 500,
                loyaltyDiscountLaar: 500,
            ),
            taxRateBp: 800,
            taxInclusive: false,
            lockedServiceCharge: ServiceChargeBreakdown::zero(),
        );

        $this->assertSame(600, $breakdown->subtotal->amountLaar);
        $this->assertSame(300, $breakdown->promoDiscount->amountLaar);
        $this->assertSame(300, $breakdown->loyaltyDiscount->amountLaar);
        $this->assertSame(600, $breakdown->totalDiscount->amountLaar);
        $this->assertSame(0, $breakdown->discountedSubtotal->amountLaar);
    }

    public function test_gift_card_excluded_from_tax_base_when_not_in_discounts_input(): void
    {
        $order = new Order;
        $order->setRelation('items', collect([
            $this->lineItem(100.00, 'standard_8'),
        ]));

        $calculator = new OrderTotalsCalculator;
        $full = $calculator->calculate(
            $order,
            new DiscountsInput,
            taxRateBp: 800,
            taxInclusive: false,
            lockedServiceCharge: ServiceChargeBreakdown::zero(),
        );
        // Production recalculateAndPersist passes giftCardDiscountLaar: 0 even when
        // the order has a soft-held gift tender — tax must match a no-gift order.
        $asTender = $calculator->calculate(
            $order,
            new DiscountsInput(giftCardDiscountLaar: 0),
            taxRateBp: 800,
            taxInclusive: false,
            lockedServiceCharge: ServiceChargeBreakdown::zero(),
        );

        $this->assertSame($full->tax->amountLaar, $asTender->tax->amountLaar);
        $this->assertSame($full->grandTotal->amountLaar, $asTender->grandTotal->amountLaar);
        $this->assertSame(800, $full->tax->amountLaar);
        $this->assertSame(10800, $full->grandTotal->amountLaar);
    }

    private function lineItem(float $totalMvr, ?string $taxCode = null): OrderItem
    {
        $item = new OrderItem;
        $item->total_price = $totalMvr;
        $item->tax_code = $taxCode;

        return $item;
    }
}
