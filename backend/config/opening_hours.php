<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Opening Hours Configuration
    |--------------------------------------------------------------------------
    |
    | Define café opening hours for each day of the week.
    | Times are in 24-hour format (HH:MM).
    | Set 'closed' => true for days when the café is closed.
    |
    */

    'timezone' => env('APP_TIMEZONE', 'Indian/Maldives'),

    'hours' => [
        // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        // Set to 24/7 for testing - adjust for production
        0 => ['open' => '00:00', 'close' => '23:59'], // Sunday
        1 => ['open' => '00:00', 'close' => '23:59'], // Monday
        2 => ['open' => '00:00', 'close' => '23:59'], // Tuesday
        3 => ['open' => '00:00', 'close' => '23:59'], // Wednesday
        4 => ['open' => '00:00', 'close' => '23:59'], // Thursday
        5 => ['open' => '00:00', 'close' => '23:59'], // Friday
        6 => ['open' => '00:00', 'close' => '23:59'], // Saturday
    ],

    // Special closures (override regular hours)
    'closures' => [
        // Format: 'YYYY-MM-DD' => 'Reason'
        // '2026-01-01' => 'New Year\'s Day',
        // '2026-07-26' => 'Independence Day',
    ],

    // Allow pre-orders when closed?
    'allow_preorders_when_closed' => false,

    // Message to display when closed
    'closed_message' => 'We are currently closed. Please check our opening hours.',

];
