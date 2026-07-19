<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class PublicEndpointThrottleTest extends TestCase
{
    use RefreshDatabase;

    public function test_gift_card_balance_route_has_throttle_middleware(): void
    {
        $route = collect(Route::getRoutes())->first(
            fn ($r) => $r->uri() === 'api/gift-cards/balance' && in_array('POST', $r->methods(), true),
        );

        $this->assertNotNull($route);
        $this->assertStringContainsString('throttle', implode(',', $route->gatherMiddleware()));
    }

    public function test_promotion_validate_route_has_throttle_middleware(): void
    {
        $route = collect(Route::getRoutes())->first(
            fn ($r) => $r->uri() === 'api/promotions/validate' && in_array('POST', $r->methods(), true),
        );

        $this->assertNotNull($route);
        $this->assertStringContainsString('throttle', implode(',', $route->gatherMiddleware()));
    }

    public function test_referral_validate_route_has_throttle_middleware(): void
    {
        $route = collect(Route::getRoutes())->first(
            fn ($r) => $r->uri() === 'api/referrals/validate' && in_array('POST', $r->methods(), true),
        );

        $this->assertNotNull($route);
        $this->assertStringContainsString('throttle', implode(',', $route->gatherMiddleware()));
    }
}
