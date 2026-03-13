<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Business Information
|--------------------------------------------------------------------------
| Single source of truth for Bake & Grill's contact and corporate details.
| Reference these values in Blade views, emails, and API responses via:
|   config('business.phone'), config('business.email'), etc.
|
| Do not hardcode these values in view files — update here instead.
*/

return [
    'name'    => env('BUSINESS_NAME', 'Bake & Grill'),
    'phone'   => env('BUSINESS_PHONE', '+960 912 0011'),
    'email'   => env('BUSINESS_EMAIL', 'hello@bakeandgrill.mv'),
    'address' => [
        'line1'   => env('BUSINESS_ADDRESS_LINE1', 'Kalaafaanu Hingun'),
        'city'    => env('BUSINESS_ADDRESS_CITY', 'Malé'),
        'country' => env('BUSINESS_ADDRESS_COUNTRY', 'Maldives'),
        'full'    => env('BUSINESS_ADDRESS_FULL', 'Kalaafaanu Hingun, Malé, Maldives'),
    ],
    'social' => [
        'whatsapp' => env('BUSINESS_WHATSAPP', 'https://wa.me/9609120011'),
        'viber'    => env('BUSINESS_VIBER', 'viber://chat?number=9609120011'),
    ],
];
