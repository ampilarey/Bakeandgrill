<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\BmlSignatureGuard;
use PHPUnit\Framework\TestCase;

class BmlSignatureGuardTest extends TestCase
{
    public function test_production_requires_signature_enforcement(): void
    {
        $this->expectException(\RuntimeException::class);
        BmlSignatureGuard::assertProductionEnforcement('production', false);
    }

    public function test_production_allows_enforced_signatures(): void
    {
        BmlSignatureGuard::assertProductionEnforcement('production', true);
        $this->assertTrue(true);
    }

    public function test_non_production_allows_disabled_enforcement(): void
    {
        BmlSignatureGuard::assertProductionEnforcement('local', false);
        BmlSignatureGuard::assertProductionEnforcement('testing', false);
        $this->assertTrue(true);
    }
}
