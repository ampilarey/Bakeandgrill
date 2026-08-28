<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Fail-closed environment guard
    |--------------------------------------------------------------------------
    | Outside production, publishing is refused unless BOTH are true:
    | this flag is on AND the target channel is marked is_test_channel.
    | scripts/clone-live-to-test.sh additionally strips credentials on every
    | clone, so a TEST box can never post to the live accounts.
    */
    'publish_allowed' => (bool) env('SOCIAL_PUBLISH_ALLOWED', false),

    // Meta Graph API version used by the Facebook/Instagram drivers.
    'graph_version' => env('SOCIAL_GRAPH_VERSION', 'v21.0'),

    // Instagram container polling: attempts × delay (seconds).
    'ig_poll_attempts' => (int) env('SOCIAL_IG_POLL_ATTEMPTS', 10),
    'ig_poll_delay' => (int) env('SOCIAL_IG_POLL_DELAY', 2),

    // At most one failure alert SMS per channel per this many seconds.
    'alert_interval' => (int) env('SOCIAL_ALERT_INTERVAL', 3600),
];
