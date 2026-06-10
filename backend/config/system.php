<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | External scheduler heartbeat URL
    |--------------------------------------------------------------------------
    |
    | Optional dead-man's switch (e.g. Healthchecks.io). When set, the
    | scheduler:heartbeat command pings this URL every minute from cron.
    |
    */

    'healthcheck_url' => env('HEALTHCHECK_URL'),

];
