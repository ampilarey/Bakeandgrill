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
        $trusted = env('TRUSTED_PROXIES');
        if ($trusted !== null && $trusted !== '') {
            $at = $trusted === '*' ? '*' : array_values(array_filter(array_map('trim', explode(',', (string) $trusted))));
            $middleware->trustProxies(at: $at, headers: Illuminate\Http\Request::HEADER_X_FORWARDED_FOR |
                Illuminate\Http\Request::HEADER_X_FORWARDED_HOST |
                Illuminate\Http\Request::HEADER_X_FORWARDED_PORT |
                Illuminate\Http\Request::HEADER_X_FORWARDED_PROTO |
                Illuminate\Http\Request::HEADER_X_FORWARDED_PREFIX);
        }

        $middleware->append(App\Http\Middleware\SecurityHeaders::class);

        // Use our custom EncryptCookies so _cauth/_cauth_name stay plain-text
        // (they are short-lived handoff cookies read by the React order app via JS)
        $middleware->encryptCookies(except: ['_cauth', '_cauth_name', '_cauth_revoked']);

        $middleware->alias([
            'device.active' => App\Http\Middleware\EnsureActiveDevice::class,
            'bml.signature' => App\Http\Middleware\VerifyBmlSignature::class,
            'role' => App\Http\Middleware\RequireRole::class,
            'permission' => App\Http\Middleware\RequirePermission::class,
            'customer.token' => App\Http\Middleware\EnsureCustomerToken::class,
            'staff.token' => App\Http\Middleware\EnsureStaffToken::class,
            'driver.token' => App\Http\Middleware\EnsureDriverToken::class,
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
