<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Smoke-check that critical app surfaces remain registered after route modularization.
 */
class RouteSurfaceRegressionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @param  list<string>  $middleware
     */
    private function assertRoute(string $uri, string $method, array $middleware = []): void
    {
        $route = collect(Route::getRoutes())->first(
            fn ($r) => $r->uri() === $uri && in_array(strtoupper($method), $r->methods(), true),
        );

        $this->assertNotNull($route, "Missing route {$method} api/{$uri}");

        if ($middleware !== []) {
            $gathered = implode(',', $route->gatherMiddleware());
            foreach ($middleware as $needle) {
                $this->assertStringContainsString($needle, $gathered, "Route api/{$uri} missing middleware {$needle}");
            }
        }
    }

    public function test_pos_routes_exist(): void
    {
        $this->assertRoute('api/pos/bootstrap', 'GET', ['staff.token']);
        $this->assertRoute('api/orders', 'POST');
        $this->assertRoute('api/pos/offline-sync', 'POST', ['staff.token']);
    }

    public function test_kds_routes_exist(): void
    {
        $this->assertRoute('api/kds/orders', 'GET', ['staff.token']);
        $this->assertRoute('api/kds/orders/{id}/bump', 'POST', ['staff.token']);
    }

    public function test_online_order_routes_exist(): void
    {
        $this->assertRoute('api/customer/orders', 'GET', ['customer.token']);
        $this->assertRoute('api/orders/{orderId}/pay/bml', 'POST');
    }

    public function test_admin_routes_exist(): void
    {
        $this->assertRoute('api/admin/customers', 'GET', ['staff.token']);
        $this->assertRoute('api/admin/gift-cards', 'GET', ['staff.token']);
    }

    public function test_payment_webhook_route_exists(): void
    {
        $this->assertRoute('api/payments/bml/webhook', 'POST');
    }
}
