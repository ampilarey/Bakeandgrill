<?php

declare(strict_types=1);

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Validation\ValidationException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Trust reverse proxies for correct HTTPS / client IP behind nginx or Cloudflare.
        // MUST list explicit proxy IPs/CIDRs in production — never use '*' (OTP/login throttles are IP-based).
        // Note: this callback can run before the config repository is bound (artisan),
        // so we read TRUSTED_PROXIES from the environment here. Application code and
        // VerifyProductionConfig use config('app.trusted_proxies') instead.
        $trusted = env('TRUSTED_PROXIES');
        if ($trusted !== null && $trusted !== '') {
            $at = $trusted === '*' ? '*' : array_values(array_filter(array_map('trim', explode(',', (string) $trusted))));
            $middleware->trustProxies(at: $at, headers: Illuminate\Http\Request::HEADER_X_FORWARDED_FOR |
                Illuminate\Http\Request::HEADER_X_FORWARDED_HOST |
                Illuminate\Http\Request::HEADER_X_FORWARDED_PORT |
                Illuminate\Http\Request::HEADER_X_FORWARDED_PROTO |
                Illuminate\Http\Request::HEADER_X_FORWARDED_PREFIX);
        }

        // Sanctum SPA cookie auth for same-origin React apps (/order, /admin).
        $middleware->statefulApi();

        // Use app CSRF middleware (Bearer bypass) for both web and Sanctum stateful stacks.
        $middleware->replace(
            Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
            App\Http\Middleware\ValidateCsrfToken::class,
        );

        $middleware->append(App\Http\Middleware\SecurityHeaders::class);

        // _cauth_revoked: short-lived JS-readable logout signal for the order SPA.
        // Do NOT except XSRF-TOKEN — Sanctum SPAs send it as X-XSRF-TOKEN, which
        // Laravel decrypts. A plain (unencrypted) XSRF cookie makes decrypt() fail
        // and every mutating /api call 419 with "CSRF token mismatch".
        $middleware->encryptCookies(except: ['_cauth_revoked']);

        // Staff/POS/admin login uses bearer tokens — CSRF on these routes breaks SPA login.
        // Route-level withoutMiddleware(ValidateCsrfToken) does NOT affect Sanctum's
        // stateful CSRF pipeline; this bootstrap except-list is the mechanism that works.
        // Bearer-authenticated API mutations are skipped in App\Http\Middleware\ValidateCsrfToken
        // (wired via config/sanctum.php) so stale XSRF cookies cannot 419 POS/admin calls.
        $middleware->validateCsrfTokens(except: [
            'api/auth/staff/*',
            'api/deploy/test-pull',
        ]);

        $middleware->alias([
            'device.active' => App\Http\Middleware\EnsureActiveDevice::class,
            'device.active.staff' => App\Http\Middleware\EnsureStaffActiveDevice::class,
            'bml.signature' => App\Http\Middleware\VerifyBmlSignature::class,
            'role' => App\Http\Middleware\RequireRole::class,
            'permission' => App\Http\Middleware\RequirePermission::class,
            'permission.any' => App\Http\Middleware\RequireAnyPermission::class,
            'customer.token' => App\Http\Middleware\EnsureCustomerToken::class,
            'staff.token' => App\Http\Middleware\EnsureStaffToken::class,
            'driver.token' => App\Http\Middleware\EnsureDriverToken::class,
            'staff_or_customer.token' => App\Http\Middleware\EnsureStaffOrCustomerToken::class,
            'staff_customer_or_driver.token' => App\Http\Middleware\EnsureStaffCustomerOrDriverToken::class,
            'service.available' => App\Http\Middleware\EnsureServiceAvailable::class,
            'service.banner' => App\Http\Middleware\ShareServiceAvailability::class,
        ]);

        // API routes must never redirect to a missing `login` named route (422/500).
        $middleware->redirectGuestsTo(function (Illuminate\Http\Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                throw new AuthenticationException('Unauthenticated.');
            }

            return '/admin/';
        });
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Sentry captures exceptions automatically via its Laravel integration.
        // The explicit log call below is kept as a secondary record for local log files.
        $exceptions->report(function (Throwable $e): void {
            if (app()->bound('log')) {
                app('log')->error($e->getMessage(), [
                    'exception' => get_class($e),
                    'file' => $e->getFile(),
                    'line' => $e->getLine(),
                    'trace' => $e->getTraceAsString(),
                ]);
            }
        });

        $exceptions->render(function (Throwable $e, Illuminate\Http\Request $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                // Named rate limiters attach a JSON body via HttpResponseException —
                // must not be rewritten into a generic 500.
                if ($e instanceof Illuminate\Http\Exceptions\HttpResponseException) {
                    return $e->getResponse();
                }

                if ($e instanceof App\Exceptions\ServiceUnavailableException) {
                    return $e->render($request);
                }

                if ($e instanceof AuthenticationException) {
                    return response()->json(['message' => 'Unauthenticated.'], 401);
                }

                if ($e instanceof ValidationException) {
                    return response()->json([
                        'message' => 'The given data was invalid.',
                        'errors' => $e->errors(),
                    ], 422);
                }

                if ($e instanceof InvalidArgumentException) {
                    return response()->json(['message' => $e->getMessage()], 422);
                }

                $status = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;
                $message = $status < 500 ? $e->getMessage() : 'Server error. Please try again.';

                return response()->json(['message' => $message], $status);
            }
        });
    })->create();
