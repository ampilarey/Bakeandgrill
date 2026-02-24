<?php

declare(strict_types=1);

return [
    'base_url' => env('BML_BASE_URL', 'https://api.merchants.bankofmaldives.com.mv'),
    'app_id' => env('BML_APP_ID'),
    'api_key' => env('BML_API_KEY'),
    'merchant_id' => env('BML_MERCHANT_ID'),
    'webhook_secret' => env('BML_WEBHOOK_SECRET'),
    'return_url' => env('BML_RETURN_URL', env('APP_URL') . '/payments/bml/return'),
    'default_currency' => env('BML_DEFAULT_CURRENCY', 'MVR'),
    'environment' => env('BML_ENVIRONMENT', 'production'),
];
