<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Services\StaffAuthRateLimit;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class StaffAuthRateLimitTest extends TestCase
{
    #[Test]
    public function keys_are_prefixed_with_app_environment(): void
    {
        $env = app()->environment();
        $this->assertSame(
            $env . ':staff-phone-login:phone:7771234:127.0.0.1',
            StaffAuthRateLimit::phoneLoginIp('phone:7771234', '127.0.0.1'),
        );
        $this->assertSame(
            $env . ':staff-pin-acct:phone:7771234',
            StaffAuthRateLimit::pinAccount('phone:7771234'),
        );
    }
}
