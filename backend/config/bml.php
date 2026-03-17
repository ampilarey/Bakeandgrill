<?php

declare(strict_types=1);

return [
    /*
    | UAT:  https://api.uat.merchants.bankofmaldives.com.mv/public
    | Prod: https://api.merchants.bankofmaldives.com.mv/public
    */
    'base_url'         => env('BML_BASE_URL'), // Must be set explicitly — no production default
    'app_id'           => env('BML_APP_ID'),
    'api_key'          => env('BML_API_KEY'),
    'merchant_id'      => env('BML_MERCHANT_ID'),
    'webhook_secret'   => env('BML_WEBHOOK_SECRET'),
    'webhook_url'      => env('BML_WEBHOOK_URL'),
    'return_url'       => env('BML_RETURN_URL'), // Must be set explicitly — nested env() breaks config:cache
    'default_currency' => env('BML_DEFAULT_CURRENCY', 'MVR'),
    'environment'      => env('BML_ENVIRONMENT', 'sandbox'), // Default to sandbox for safety

    /*
    | Auth mode for Authorization header:
    |   raw          → {API_KEY}                   (BML UAT — use this for sandbox)
    |   bearer_jwt   → Bearer {API_KEY}
    |   bearer_basic → Bearer base64(API_KEY:APP_ID)
    |   auto         → eyJ... = bearer_jwt, else bearer_basic
    */
    'auth_mode' => env('BML_AUTH_MODE', 'auto'),

    /*
    | API paths (BML Connect v2)
    */
    'paths' => [
        'create_transaction' => '/v2/transactions',
        'get_transaction'    => '/v2/transactions/{reference}',
    ],

    /*
    | paymentPortalExperience — required by BML Connect v2 API
    */
    'payment_portal_experience' => [
        'external_website_terms_accepted' => env('BML_EXTERNAL_TERMS_ACCEPTED', true),
        'external_website_terms_url'      => env('BML_EXTERNAL_TERMS_URL'),
        'skip_provider_selection'         => env('BML_SKIP_PROVIDER_SELECTION', false),
    ],

    'webhook_signature_header' => env('BML_WEBHOOK_SIGNATURE_HEADER', 'X-BML-Signature'),
    'webhook_hmac_algo'        => env('BML_WEBHOOK_HMAC_ALGO', 'sha256'),
];
