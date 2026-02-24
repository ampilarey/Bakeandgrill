<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Shared\ValueObjects\Money;
use InvalidArgumentException;
use Tests\TestCase;

class MoneyTest extends TestCase
{
    public function test_from_mvr_converts_correctly(): void
    {
        $money = Money::fromMvr(25.00);
        $this->assertEquals(2500, $money->amountLaar);
    }

    public function test_to_mvr_string(): void
    {
        $money = new Money(2500);
        $this->assertEquals('25.00', $money->toMvrString());
    }

    public function test_add(): void
    {
        $a = new Money(1000);
        $b = new Money(500);
        $this->assertEquals(1500, $a->add($b)->amountLaar);
    }

    public function test_subtract_does_not_go_negative(): void
    {
        $a = new Money(500);
        $b = new Money(1000);
        $this->assertEquals(0, $a->subtract($b)->amountLaar);
    }

    public function test_percentage_discount_uses_floor(): void
    {
        // 10% of MVR 33.33 = 3.333 → floor → 3.33 → 333 laari
        $money = Money::fromMvr(33.33);
        $discount = $money->percentageDiscount(1000); // 10%
        $this->assertEquals(333, $discount->amountLaar);
    }

    public function test_percentage_discount_zero_bp(): void
    {
        $money = new Money(10000);
        $this->assertEquals(0, $money->percentageDiscount(0)->amountLaar);
    }

    public function test_add_tax_standard(): void
    {
        // MVR 100 + 12% GST = MVR 112
        $money = Money::fromMvr(100.00);
        $withTax = $money->addTax(1200);
        $this->assertEquals(11200, $withTax->amountLaar);
    }

    public function test_extract_tax_inclusive(): void
    {
        // MVR 112 inclusive of 12% GST → tax = 12
        $money = Money::fromMvr(112.00);
        $tax = $money->extractTax(1200);
        $this->assertEquals(1200, $tax->amountLaar);
    }

    public function test_negative_amount_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new Money(-1);
    }

    public function test_currency_mismatch_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);
        (new Money(100, 'MVR'))->add(new Money(100, 'USD'));
    }

    public function test_min_and_max(): void
    {
        $a = new Money(100);
        $b = new Money(200);
        $this->assertEquals(100, $a->min($b)->amountLaar);
        $this->assertEquals(200, $a->max($b)->amountLaar);
    }

    public function test_multiply(): void
    {
        $money = new Money(1000);
        $this->assertEquals(2500, $money->multiply(2.5)->amountLaar);
    }

    public function test_is_zero(): void
    {
        $this->assertTrue(Money::zero()->isZero());
        $this->assertFalse(new Money(1)->isZero());
    }
}
