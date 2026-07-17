<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\UnitConversion;
use App\Services\UnitConversionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UnitConversionServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_same_unit_returns_quantity_unchanged(): void
    {
        $svc = app(UnitConversionService::class);
        $this->assertSame(2.5, $svc->convert(2.5, 'kg', 'kg'));
        $this->assertSame(2.5, $svc->convert(2.5, null, 'kg'));
    }

    public function test_direct_and_reverse_conversion(): void
    {
        UnitConversion::create(['from_unit' => 'kg', 'to_unit' => 'g', 'factor' => 1000]);
        app(UnitConversionService::class)->bustCache();
        $svc = app(UnitConversionService::class);

        $this->assertSame(2500.0, $svc->convert(2.5, 'kg', 'g'));
        $this->assertEqualsWithDelta(2.5, $svc->convert(2500, 'g', 'kg'), 0.0001);
    }
}
