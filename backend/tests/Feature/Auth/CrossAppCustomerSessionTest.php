<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * Cross-app customer auth: Blade site and /order SPA share one Laravel session
 * via Sanctum statefulApi() (cookie + matching Referer/Origin).
 *
 * Uses the HTTP kernel (not actingAs) so Auth singletons cannot leak a prior
 * request's customer into GET /api/auth/customer/check.
 */
class CrossAppCustomerSessionTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'sanctum.stateful' => ['bakeandgrill.mv', 'test.bakeandgrill.mv', 'localhost'],
            'session.domain' => null,
            'session.secure' => false,
            'session.same_site' => 'lax',
        ]);

        $this->customer = Customer::create([
            'name' => 'Cross App Customer',
            'phone' => '+9607111222',
            'is_active' => true,
            'is_profile_complete' => true,
        ]);
        $this->customer->password = 'secret123';
        $this->customer->save();
    }

    public function test_blade_login_session_is_visible_to_order_app_check(): void
    {
        $cookies = $this->bladePasswordLogin();

        $response = $this->kernelCall('GET', '/api/auth/customer/check', $cookies, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTP_REFERER' => 'https://bakeandgrill.mv/order/order-history',
            'HTTPS' => 'on',
        ]);

        $this->assertSame(200, $response->getStatusCode(), $response->getContent());
        $payload = json_decode($response->getContent(), true);
        $this->assertTrue($payload['authenticated'] ?? false);
        $this->assertSame($this->customer->id, $payload['customer']['id'] ?? null);
    }

    public function test_order_app_api_login_session_is_visible_on_blade_routes(): void
    {
        $cookies = $this->apiPasswordLogin();

        $response = $this->kernelCall('GET', '/customer/login', $cookies, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTPS' => 'on',
        ]);

        $this->assertSame(302, $response->getStatusCode(), $response->getContent());
        $this->assertStringContainsString('/order/menu', (string) $response->headers->get('Location'));
    }

    public function test_my_orders_banner_path_session_check_succeeds(): void
    {
        $cookies = $this->bladePasswordLogin();

        $response = $this->kernelCall('GET', '/api/auth/customer/check', $cookies, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTP_ORIGIN' => 'https://bakeandgrill.mv',
            'HTTP_REFERER' => 'https://bakeandgrill.mv/order/order-history',
            'HTTPS' => 'on',
        ]);

        $this->assertSame(200, $response->getStatusCode(), $response->getContent());
        $this->assertTrue(data_get(json_decode($response->getContent(), true), 'authenticated'));
    }

    public function test_blade_logout_invalidates_order_app_session_and_sets_revoked_signal(): void
    {
        $cookies = $this->bladePasswordLogin();

        $logout = $this->kernelCall('POST', '/customer/logout', $cookies, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTPS' => 'on',
            'HTTP_X_XSRF_TOKEN' => $this->plainXsrfFromCookies($cookies),
        ]);
        $this->assertTrue(in_array($logout->getStatusCode(), [200, 302], true), $logout->getContent());
        $this->assertArrayHasKey('_cauth_revoked', $this->cookieMapFromResponse($logout));

        $after = $this->mergeResponseCookies($cookies, $logout);

        $check = $this->kernelCall('GET', '/api/auth/customer/check', $after, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTP_REFERER' => 'https://bakeandgrill.mv/order/',
            'HTTPS' => 'on',
        ]);
        $this->assertSame(401, $check->getStatusCode(), $check->getContent());
    }

    public function test_api_logout_invalidates_blade_and_order_sessions(): void
    {
        $cookies = $this->bladePasswordLogin();

        $logout = $this->kernelCall('POST', '/api/auth/customer/logout', $cookies, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTP_REFERER' => 'https://bakeandgrill.mv/order/',
            'HTTP_ORIGIN' => 'https://bakeandgrill.mv',
            'HTTPS' => 'on',
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_XSRF_TOKEN' => $this->plainXsrfFromCookies($cookies),
        ], '{}');
        $this->assertSame(200, $logout->getStatusCode(), $logout->getContent());
        $this->assertArrayHasKey('_cauth_revoked', $this->cookieMapFromResponse($logout));

        $after = $this->mergeResponseCookies($cookies, $logout);

        $blade = $this->kernelCall('GET', '/customer/login', $after, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTPS' => 'on',
        ]);
        // Logged out → login form (200), not redirect to /order/menu.
        $this->assertSame(200, $blade->getStatusCode(), $blade->getContent());

        $check = $this->kernelCall('GET', '/api/auth/customer/check', $after, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTP_REFERER' => 'https://bakeandgrill.mv/order/',
            'HTTPS' => 'on',
        ]);
        $this->assertSame(401, $check->getStatusCode());
    }

    public function test_deactivated_customer_cannot_pass_session_check(): void
    {
        $cookies = $this->bladePasswordLogin();
        $this->customer->update(['is_active' => false]);

        $response = $this->kernelCall('GET', '/api/auth/customer/check', $cookies, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTP_REFERER' => 'https://bakeandgrill.mv/order/',
            'HTTPS' => 'on',
        ]);

        $this->assertSame(403, $response->getStatusCode(), $response->getContent());
        $this->assertFalse(data_get(json_decode($response->getContent(), true), 'authenticated'));
    }

    public function test_session_cookie_without_stateful_referer_or_origin_is_ignored(): void
    {
        // REAL CAUSE (Sanctum gating): fromFrontend() is false without Referer/Origin
        // matching sanctum.stateful — StartSession never runs for the API request.
        $cookies = $this->bladePasswordLogin();

        $response = $this->kernelCall('GET', '/api/auth/customer/check', $cookies, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTPS' => 'on',
        ]);

        $this->assertSame(401, $response->getStatusCode(), $response->getContent());
        $this->assertFalse(data_get(json_decode($response->getContent(), true), 'authenticated'));
    }

    public function test_www_host_not_in_stateful_list_is_ignored(): void
    {
        // Config: browsed host must be in SANCTUM_STATEFUL_DOMAINS. www is not
        // listed by default — owner must add it if customers use www.
        $cookies = $this->bladePasswordLogin();

        $response = $this->kernelCall('GET', '/api/auth/customer/check', $cookies, [
            'HTTP_HOST' => 'www.bakeandgrill.mv',
            'HTTP_REFERER' => 'https://www.bakeandgrill.mv/order/order-history',
            'HTTP_ORIGIN' => 'https://www.bakeandgrill.mv',
            'HTTPS' => 'on',
        ]);

        $this->assertSame(401, $response->getStatusCode(), $response->getContent());
    }

    public function test_blade_web_session_still_works_after_stateful_api_check(): void
    {
        $cookies = $this->bladePasswordLogin();

        $check = $this->kernelCall('GET', '/api/auth/customer/check', $cookies, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTP_REFERER' => 'https://bakeandgrill.mv/order/',
            'HTTPS' => 'on',
        ]);
        $this->assertSame(200, $check->getStatusCode(), $check->getContent());
        $cookies = $this->mergeResponseCookies($cookies, $check);

        $blade = $this->kernelCall('GET', '/customer/login', $cookies, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTPS' => 'on',
        ]);
        $this->assertSame(302, $blade->getStatusCode());
        $this->assertStringContainsString('/order/menu', (string) $blade->headers->get('Location'));
    }

    public function test_cauth_revoked_cookie_does_not_grant_or_block_live_session(): void
    {
        // No _cauth handoff exists. _cauth_revoked is a logout signal for the SPA only.
        $guest = $this->kernelCall('GET', '/api/auth/customer/check', [
            '_cauth_revoked' => '1',
        ], [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTP_REFERER' => 'https://bakeandgrill.mv/order/',
            'HTTPS' => 'on',
        ]);
        $this->assertSame(401, $guest->getStatusCode());

        $cookies = $this->bladePasswordLogin();
        $cookies['_cauth_revoked'] = '1';

        $authed = $this->kernelCall('GET', '/api/auth/customer/check', $cookies, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTP_REFERER' => 'https://bakeandgrill.mv/order/order-history',
            'HTTPS' => 'on',
        ]);
        $this->assertSame(200, $authed->getStatusCode(), $authed->getContent());
        $this->assertTrue(data_get(json_decode($authed->getContent(), true), 'authenticated'));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** @return array<string, string> */
    private function bladePasswordLogin(): array
    {
        $page = $this->kernelCall('GET', '/customer/login', [], [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTPS' => 'on',
        ]);
        $cookies = $this->cookieMapFromResponse($page);
        $token = $this->csrfTokenFromHtml($page->getContent())
            ?? $this->plainXsrfFromCookies($cookies);
        $this->assertNotEmpty($token, 'login page must expose a CSRF token');

        $response = $this->kernelCall(
            'POST',
            '/customer/login',
            $cookies,
            [
                'HTTP_HOST' => 'bakeandgrill.mv',
                'HTTPS' => 'on',
                'HTTP_ACCEPT' => 'text/html',
            ],
            null,
            [
                'phone' => '7111222',
                'password' => 'secret123',
                '_token' => $token,
            ],
        );

        $cookies = $this->mergeResponseCookies($cookies, $response);
        $this->assertSame(302, $response->getStatusCode(), $response->getContent());
        $this->assertStringNotContainsString(
            '/customer/login',
            (string) $response->headers->get('Location'),
            'password login must leave the login page',
        );
        $this->assertArrayHasKey((string) config('session.cookie'), $cookies);

        return $cookies;
    }

    /** @return array<string, string> */
    private function apiPasswordLogin(): array
    {
        $page = $this->kernelCall('GET', '/customer/login', [], [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTPS' => 'on',
        ]);
        $cookies = $this->cookieMapFromResponse($page);

        $response = $this->kernelCall('POST', '/api/auth/customer/login', $cookies, [
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTP_REFERER' => 'https://bakeandgrill.mv/order/login',
            'HTTP_ORIGIN' => 'https://bakeandgrill.mv',
            'HTTPS' => 'on',
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_XSRF_TOKEN' => $this->plainXsrfFromCookies($cookies),
        ], json_encode([
            'phone' => '7111222',
            'password' => 'secret123',
        ], JSON_THROW_ON_ERROR));

        $this->assertSame(200, $response->getStatusCode(), $response->getContent());

        return $this->mergeResponseCookies($cookies, $response);
    }

    /**
     * @param  array<string, string>  $cookies
     * @param  array<string, string>  $server
     * @param  array<string, mixed>  $parameters
     */
    private function kernelCall(
        string $method,
        string $uri,
        array $cookies,
        array $server = [],
        ?string $content = null,
        array $parameters = [],
    ) {
        $this->isolateAuthGuards();
        $kernel = $this->app->make(\Illuminate\Contracts\Http\Kernel::class);
        $server = array_merge([
            'HTTP_ACCEPT' => str_starts_with($uri, '/api/') ? 'application/json' : 'text/html',
            'HTTP_HOST' => 'bakeandgrill.mv',
            'HTTPS' => 'on',
        ], $server);

        return $kernel->handle(Request::create($uri, $method, $parameters, $cookies, [], $server, $content));
    }

    /**
     * Prevent SessionGuard from reusing an in-memory login from a prior request
     * in this PHPUnit process. Persists the current session id payload first,
     * then switches the store to a fresh empty id so non-stateful API calls
     * cannot see login_customer_* until StartSession reloads the cookie.
     */
    private function isolateAuthGuards(): void
    {
        if ($this->app->bound('session')) {
            $store = $this->app['session']->driver();
            if ($store->isStarted()) {
                $store->save();
            }
            $store->flush();
            $store->setId(str_replace('.', '', uniqid('isolated', true)));
        }

        Auth::guard('customer')->forgetUser();
        Auth::forgetGuards();
        $this->app->forgetInstance('auth');
        Auth::clearResolvedInstances();
    }

    /** @return array<string, string> */
    private function cookieMapFromResponse($response): array
    {
        $out = [];
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getValue() === null || $cookie->getValue() === '') {
                continue;
            }
            if ($cookie->getExpiresTime() > 0 && $cookie->getExpiresTime() < time()) {
                continue;
            }
            $out[$cookie->getName()] = (string) $cookie->getValue();
        }
        foreach ($this->app->make('cookie')->getQueuedCookies() as $cookie) {
            $out[$cookie->getName()] = (string) $cookie->getValue();
        }

        return $out;
    }

    /**
     * @param  array<string, string>  $cookies
     * @return array<string, string>
     */
    private function mergeResponseCookies(array $cookies, $response): array
    {
        foreach ($response->headers->getCookies() as $cookie) {
            $expired = $cookie->getExpiresTime() > 0 && $cookie->getExpiresTime() < time();
            if ($expired || $cookie->getValue() === null || $cookie->getValue() === '') {
                unset($cookies[$cookie->getName()]);
                continue;
            }
            $cookies[$cookie->getName()] = (string) $cookie->getValue();
        }

        return $cookies;
    }

    /** @param  array<string, string>  $cookies */
    private function plainXsrfFromCookies(array $cookies): string
    {
        $raw = $cookies['XSRF-TOKEN'] ?? '';
        if ($raw === '') {
            return '';
        }
        try {
            return $this->app['encrypter']->decrypt($raw, false);
        } catch (\Throwable) {
            return rawurldecode($raw);
        }
    }

    private function csrfTokenFromHtml(string $html): ?string
    {
        if (preg_match('/name="_token"\s+value="([^"]+)"/', $html, $m)) {
            return $m[1];
        }
        if (preg_match('/name="csrf-token"\s+content="([^"]+)"/', $html, $m)) {
            return $m[1];
        }

        return null;
    }
}
