<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Http\Middleware\ThrottleRequestsPerRoute;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * A bare `throttle:N,M` in Laravel keys its counter on the visitor alone, so every
 * route that uses it shares one count and ordinary browsing can lock someone out
 * of sign-in. Bake & Grill binds ThrottleRequestsPerRoute in its place (UI audit,
 * 2026-10-10; iruali import plan, feature 19). This holds the binding: if it is
 * ever dropped, the second route below is refused and the test fails.
 */
class RateLimitPerRouteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Route::middleware('throttle:2,1')->get('/_test/throttle-a', fn () => 'a');
        Route::middleware('throttle:2,1')->get('/_test/throttle-b', fn () => 'b');
    }

    public function test_the_framework_throttle_resolves_to_the_per_route_one(): void
    {
        $this->assertInstanceOf(ThrottleRequestsPerRoute::class, app(ThrottleRequests::class));
    }

    public function test_using_up_one_route_does_not_block_another(): void
    {
        $this->get('/_test/throttle-a')->assertOk();
        $this->get('/_test/throttle-a')->assertOk();
        $this->get('/_test/throttle-a')->assertStatus(429);

        $this->get('/_test/throttle-b')->assertOk();
        $this->get('/_test/throttle-b')->assertOk();
        $this->get('/_test/throttle-b')->assertStatus(429);
    }
}
