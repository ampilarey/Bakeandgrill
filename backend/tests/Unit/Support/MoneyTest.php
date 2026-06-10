<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\Money;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class MoneyTest extends TestCase
{
    #[Test]
    public function to_laar_handles_float_precision(): void
    {
        $this->assertSame(30, Money::toLaar(0.1 + 0.2));
    }

    #[Test]
    public function to_laar_converts_decimal_strings(): void
    {
        $this->assertSame(1999, Money::toLaar('19.99'));
        $this->assertSame(2550, Money::toLaar('25.50'));
    }

    #[Test]
    public function to_laar_null_is_zero(): void
    {
        $this->assertSame(0, Money::toLaar(null));
    }

    #[Test]
    public function to_laar_allows_negative_values(): void
    {
        $this->assertSame(-500, Money::toLaar('-5.00'));
    }

    #[Test]
    public function to_mvr_converts_laari_back_to_mvr(): void
    {
        $this->assertSame(19.99, Money::toMvr(1999));
    }
}
