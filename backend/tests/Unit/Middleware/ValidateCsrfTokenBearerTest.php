<?php

declare(strict_types=1);

namespace Tests\Unit\Middleware;

use App\Http\Middleware\ValidateCsrfToken;
use Illuminate\Http\Request;
use ReflectionMethod;
use Tests\TestCase;

class ValidateCsrfTokenBearerTest extends TestCase
{
    public function test_sanctum_config_uses_app_csrf_middleware(): void
    {
        $this->assertSame(
            ValidateCsrfToken::class,
            config('sanctum.middleware.validate_csrf_token'),
        );
    }

    public function test_bearer_authorization_is_detected(): void
    {
        $middleware = $this->app->make(ValidateCsrfToken::class);
        $method = new ReflectionMethod(ValidateCsrfToken::class, 'hasBearerToken');

        $withBearer = Request::create('/api/shifts/open', 'POST');
        $withBearer->headers->set('Authorization', 'Bearer test-token');
        $this->assertTrue($method->invoke($middleware, $withBearer));

        $without = Request::create('/api/shifts/open', 'POST');
        $this->assertFalse($method->invoke($middleware, $without));

        $basic = Request::create('/api/shifts/open', 'POST');
        $basic->headers->set('Authorization', 'Basic abc');
        $this->assertFalse($method->invoke($middleware, $basic));
    }

    public function test_bearer_request_skips_csrf_and_reaches_next(): void
    {
        $middleware = $this->app->make(ValidateCsrfToken::class);

        $request = Request::create('/api/shifts/open', 'POST', ['opening_cash' => 0]);
        $request->headers->set('Authorization', 'Bearer pos-token');
        $request->headers->set('Origin', 'https://test.bakeandgrill.mv');
        // Deliberately wrong CSRF header — must still pass with Bearer.
        $request->headers->set('X-XSRF-TOKEN', 'stale-or-wrong-token');

        $reached = false;
        $response = $middleware->handle($request, function () use (&$reached) {
            $reached = true;

            return response()->json(['ok' => true], 200);
        });

        $this->assertTrue($reached);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(['ok' => true], $response->getData(true));
    }
}
