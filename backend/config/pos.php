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

    /*
     * Whether a POS device must be approved before it can be used.
     *
     * Defaults to ON. Left off, a correct PIN from ANY device — a phone, a
     * laptop in a car park — registers itself and opens a till, so a leaked
     * PIN is the only thing standing between an outsider and your takings.
     * With it on, an unknown device registers as pending and an owner approves
     * it in Admin -> Devices, where a pending list already polls every few
     * seconds. Set POS_STRICT_DEVICE_APPROVAL=false only while setting up.
     */
    'strict_device_approval' => filter_var(
        env('POS_STRICT_DEVICE_APPROVAL', true),
        FILTER_VALIDATE_BOOLEAN,
    ),
];
