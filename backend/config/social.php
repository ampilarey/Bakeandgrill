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

    /*
    |--------------------------------------------------------------------------
    | "Connect with Facebook" (Meta app)
    |--------------------------------------------------------------------------
    | With an app id and secret the Channels tab offers a one-click connect:
    | the owner logs in to Facebook, picks the Page, and the long-lived Page
    | token (and the linked Instagram account) are stored as channels. Without
    | them the manual token entry still works. The redirect URI must be listed
    | in the Meta app's "Valid OAuth Redirect URIs"; leave it empty to use
    | {APP_URL}/social/meta/callback.
    */
    'meta_app_id' => env('SOCIAL_META_APP_ID'),
    'meta_app_secret' => env('SOCIAL_META_APP_SECRET'),
    'meta_redirect_uri' => env('SOCIAL_META_REDIRECT_URI'),
];
