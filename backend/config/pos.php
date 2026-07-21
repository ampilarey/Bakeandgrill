<?php

declare(strict_types=1);

return [
    /*
    | Device policy
    |
    | - POS_REQUIRE_DEVICE_HEADER: when true, routes behind device.active
    |   reject missing X-Device-Identifier with HTTP 428.
    |   Default: true in production, false otherwise (local/testing/café mode).
    | - Owner-disabled devices (is_active=false): always blocked when header is present.
    | - POS_STRICT_DEVICE_APPROVAL=true: also reject pending/unapproved devices.
    */
    'require_device_header' => filter_var(
        env(
            'POS_REQUIRE_DEVICE_HEADER',
            env('APP_ENV') === 'production' ? 'true' : 'false',
        ),
        FILTER_VALIDATE_BOOLEAN,
    ),

    'strict_device_approval' => filter_var(
        env('POS_STRICT_DEVICE_APPROVAL', false),
        FILTER_VALIDATE_BOOLEAN,
    ),
];
