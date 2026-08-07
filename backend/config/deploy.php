<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | TEST deploy webhook secret
    |--------------------------------------------------------------------------
    |
    | Shared secret for POST /api/deploy/test-pull. Set the same value in the
    | test server .env and GitHub Actions secret TEST_DEPLOY_WEBHOOK_SECRET
    | (environment: test). Leave empty to disable the endpoint (404).
    |
    */

    'test_webhook_secret' => env('TEST_DEPLOY_WEBHOOK_SECRET'),

    /*
    |--------------------------------------------------------------------------
    | Hosts allowed to run TEST auto-deploy
    |--------------------------------------------------------------------------
    |
    | Production must never honour this webhook. Compared against the request
    | host and APP_URL host (case-insensitive).
    |
    */

    'test_allowed_hosts' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('TEST_DEPLOY_ALLOWED_HOSTS', 'test.bakeandgrill.mv')),
    ))),

];
