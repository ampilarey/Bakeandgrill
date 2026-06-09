<?php

declare(strict_types=1);

return [
    /*
    | Device policy (Bake & Grill default: relaxed café mode)
    |
    | - Missing X-Device-Identifier: always allowed (sales never blocked for missing header).
    | - Owner-disabled devices (is_active=false): always blocked when header is present.
    | - POS_STRICT_DEVICE_APPROVAL=true: also reject pending/unapproved devices.
    |
    | Do not add a "require device header in production" flag — that conflicts with
    | staff logging in from any browser when the owner has not enrolled devices.
    */
    'strict_device_approval' => env('POS_STRICT_DEVICE_APPROVAL', false),
];
