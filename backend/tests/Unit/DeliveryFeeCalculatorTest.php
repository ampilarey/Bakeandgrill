<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Delivery\Services\DeliveryFeeCalculator;
use Tests\TestCase;

class DeliveryFeeCalculatorTest extends TestCase
{
    private DeliveryFeeCalculator $calculator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->calculator = new DeliveryFeeCalculator();
    }

    public function test_known_island_returns_correct_fee(): void
    {
        $this->assertEquals(20.00, $this->calculator->calculate('Male'));
        $this->assertEquals(30.00, $this->calculator->calculate('Hulhumale'));
        $this->assertEquals(30.00, $this->calculator->calculate('Vilimale'));
        $this->assertEquals(50.00, $this->calculator->calculate('Maafushi'));
    }

    public function test_island_lookup_is_case_insensitive(): void
    {
        $this->assertEquals(20.00, $this->calculator->calculate('male'));
        $this->assertEquals(20.00, $this->calculator->calculate('MALE'));
        $this->assertEquals(30.00, $this->calculator->calculate('HULHUMALE'));
    }

    public function test_unknown_island_returns_default_fee(): void
    {
        $fee = $this->calculator->calculate('SomeRemoteAtoll');
        $this->assertEquals(30.00, $fee); // default from config
    }

    public function test_calculate_laar_converts_correctly(): void
    {
        // Male fee = 20 MVR = 2000 laari
        $this->assertEquals(2000, $this->calculator->calculateLaar('Male'));
        // Hulhumale fee = 30 MVR = 3000 laari
        $this->assertEquals(3000, $this->calculator->calculateLaar('Hulhumale'));
    }

    public function test_calculate_laar_floors_properly(): void
    {
        // Default fee is 30.00 MVR = 3000 laari (no fractions in these defaults)
        $laar = $this->calculator->calculateLaar('Unknown Island');
        $this->assertIsInt($laar);
        $this->assertEquals(3000, $laar);
    }
}
