<?php

declare(strict_types=1);

return [
    /*
    | When true, POS routes reject devices that are not approved/active in admin.
    | Default false — device header is audit-only; only owner-disabled devices block.
    */
    'strict_device_approval' => env('POS_STRICT_DEVICE_APPROVAL', false),
];
