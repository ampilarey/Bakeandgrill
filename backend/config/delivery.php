<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Default Delivery Fee (MVR)
    |--------------------------------------------------------------------------
    |
    | Used when the destination island is not in the zones map below.
    |
    */
    'default_fee' => (float) env('DELIVERY_DEFAULT_FEE', 30.00),

    /*
    |--------------------------------------------------------------------------
    | Zone-based Fees (Island => MVR)
    |--------------------------------------------------------------------------
    |
    | Set per-island fees. Keys are island names (case-insensitive).
    | Override by setting DELIVERY_ZONES as a JSON string in .env,
    | or modify this file directly.
    |
    */
    'zones' => json_decode(env('DELIVERY_ZONES', '{}'), true) ?: [
        'Male' => 20.00,
        'Hulhumale' => 30.00,
        'Vilimale' => 30.00,
        'Maafushi' => 50.00,
    ],
];
