<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | External scheduler heartbeat URL
    |--------------------------------------------------------------------------
    |
    | Optional dead-man's switch (e.g. Healthchecks.io). When set, the
    | scheduler:heartbeat command pings this URL every minute from cron.
    |
    */

    'healthcheck_url' => env('HEALTHCHECK_URL'),

    /*
    |--------------------------------------------------------------------------
    | OTP_DEV_RETURN — return OTP codes in API responses (local/testing only)
    |--------------------------------------------------------------------------
    |
    | Controllers must ALSO gate on app()->environment(['local','testing']).
    | Never enable this in production. Read via config(), never env(), so
    | values survive `php artisan config:cache`.
    |
    */

    'otp_dev_return' => filter_var(env('OTP_DEV_RETURN', false), FILTER_VALIDATE_BOOLEAN),

    /*
    |--------------------------------------------------------------------------
    | ALLOW_STAFF_CLI_CREATE — gate staff:create / activate / set-password
    |--------------------------------------------------------------------------
    |
    | Read via config('system.allow_staff_cli_create'), never env() in commands.
    |
    */

    'allow_staff_cli_create' => filter_var(env('ALLOW_STAFF_CLI_CREATE', false), FILTER_VALIDATE_BOOLEAN),

];
