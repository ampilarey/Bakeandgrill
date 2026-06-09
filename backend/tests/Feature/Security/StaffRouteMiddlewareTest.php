<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Staff-only API prefixes must include staff.token middleware.
 */
class StaffRouteMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    /** Staff-only prefixes (dual customer/staff routes under api/orders are excluded). */
    /** @var list<string> */
    /** Public endpoints that share a staff prefix but must stay unauthenticated. */
    private const PUBLIC_EXCEPTIONS = [
        'api/site-settings/public',
        'api/stream/order-status/',
    ];

    private const STAFF_PREFIXES = [
        'api/pos/',
        'api/kds/',
        'api/shifts',
        'api/devices',
        'api/admin/',
        'api/reports',
        'api/invoices',
        'api/webhooks',
        'api/stream',
        'api/time-clock',
        'api/waste-logs',
        'api/permissions',
        'api/site-settings',
    ];

    public function test_staff_route_prefixes_require_staff_token_middleware(): void
    {
        $violations = [];

        foreach (Route::getRoutes() as $route) {
            $uri = $route->uri();
            if (!$this->isStaffPrefix($uri)) {
                continue;
            }

            $middleware = implode(',', $route->gatherMiddleware());
            if (str_contains($middleware, 'customer.token')) {
                continue;
            }
            if (!str_contains($middleware, 'staff.token')) {
                $violations[] = $uri . ' [' . implode('|', $route->methods()) . ']';
            }
        }

        $this->assertSame(
            [],
            $violations,
            "Staff routes missing staff.token middleware:\n" . implode("\n", $violations),
        );
    }

    private function isStaffPrefix(string $uri): bool
    {
        foreach (self::PUBLIC_EXCEPTIONS as $exception) {
            if (str_starts_with($uri, $exception)) {
                return false;
            }
        }

        foreach (self::STAFF_PREFIXES as $prefix) {
            if (str_starts_with($uri, $prefix)) {
                return true;
            }
        }

        return false;
    }
}
