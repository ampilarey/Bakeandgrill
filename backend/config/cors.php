<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Configure allowed origins, headers, and methods for API requests.
    | In production, set specific origins in FRONTEND_URL env variable.
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter([
        env('FRONTEND_URL'), // Production frontend domain
        env('POS_URL'),      // POS app URL (optional)
        env('KDS_URL'),      // KDS app URL (optional)
        // Allow localhost only in local/dev environment
        env('APP_ENV') !== 'production' ? 'http://localhost:3003' : null,
        env('APP_ENV') !== 'production' ? 'http://localhost:3001' : null,
        env('APP_ENV') !== 'production' ? 'http://localhost:3002' : null,
    ]),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
