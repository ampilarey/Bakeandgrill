<?php

declare(strict_types=1);

use Laravel\Sanctum\Sanctum;

return [

    /*
    |--------------------------------------------------------------------------
    | Stateful Domains
    |--------------------------------------------------------------------------
    |
    | Requests from the following domains / hosts will receive stateful API
    | authentication cookies. Typically, these should include your local
    | and production domains which access your API via a frontend SPA.
    |
    */

    'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', sprintf(
        '%s%s',
        'localhost,localhost:3000,127.0.0.1,127.0.0.1:8000,::1',
        Sanctum::currentApplicationUrlWithPort(),
        // Sanctum::currentRequestHost(),
    ))),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Guards
    |--------------------------------------------------------------------------
    |
    | This array contains the authentication guards that will be checked when
    | Sanctum is trying to authenticate a request. If none of these guards
    | are able to authenticate the request, Sanctum will use the bearer
    | token that's present on an incoming request for authentication.
    |
    */

    'guard' => ['web', 'customer'],

    /*
    |--------------------------------------------------------------------------
    | Expiration Minutes
    |--------------------------------------------------------------------------
    |
    | This value controls the number of minutes until an issued token will be
    | considered expired. This will override any values set in the token's
    | "expires_at" attribute, but first-party sessions are not affected.
    |
    */

    // Empty env values must not become 0 — that makes every token instantly invalid.
    'expiration' => ($minutes = env('SANCTUM_TOKEN_EXPIRATION', env('SANCTUM_EXPIRATION'))) !== null && $minutes !== ''
        ? (int) $minutes
        : 10080,

    /*
    |--------------------------------------------------------------------------
    | Per-token TTL overrides (hours)
    |--------------------------------------------------------------------------
    |
    | Used when issuing Sanctum personal access tokens with an explicit
    | expires_at. Admin dashboard (phone+password), POS (PIN), and driver
    | apps each get shorter-lived tokens than the global expiration default.
    |
    */

    'admin_token_ttl_hours' => max(1, (int) (env('ADMIN_TOKEN_TTL_HOURS') ?: 24)),
    'pos_token_ttl_hours' => max(1, (int) (env('POS_TOKEN_TTL_HOURS') ?: 72)),
    'driver_token_ttl_hours' => max(1, (int) (env('DRIVER_TOKEN_TTL_HOURS') ?: 12)),

    /*
    |--------------------------------------------------------------------------
    | Token Prefix
    |--------------------------------------------------------------------------
    |
    | Sanctum can prefix new tokens in order to take advantage of numerous
    | security scanning initiatives maintained by open source platforms
    | that notify developers if they commit tokens into repositories.
    |
    | See: https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning
    |
    */

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Middleware
    |--------------------------------------------------------------------------
    |
    | When authenticating your first-party SPA with Sanctum you may need to
    | customize some of the middleware Sanctum uses while processing the
    | request. You may change the middleware listed below as required.
    |
    */

    'middleware' => [
        'authenticate_session' => Laravel\Sanctum\Http\Middleware\AuthenticateSession::class,
        'encrypt_cookies' => Illuminate\Cookie\Middleware\EncryptCookies::class,
        // Custom: skip CSRF when Authorization: Bearer is present (POS/admin tokens).
        'validate_csrf_token' => App\Http\Middleware\ValidateCsrfToken::class,
    ],

];
