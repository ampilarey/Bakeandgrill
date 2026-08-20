<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Issuer
    |--------------------------------------------------------------------------
    | The name the authenticator app shows above the code. Staff will have a
    | personal Google account and a bank in the same list, so this has to say
    | which business it belongs to.
    */
    'issuer' => env('TWO_FACTOR_ISSUER', 'Bake & Grill'),

    /*
    |--------------------------------------------------------------------------
    | Required for admin access
    |--------------------------------------------------------------------------
    | Off by default, and it should stay off until every admin.access account
    | has actually enrolled — switching it on beforehand locks them out of the
    | panel they would enrol from. When true, an admin sign-in by an account
    | with no second factor is refused rather than let through.
    |
    | Accounts signing in to the POS are never covered by this: a till is not
    | the place to ask a cook for a code off a phone they may not carry.
    */
    'required_for_admin' => filter_var(
        env('TWO_FACTOR_REQUIRED_FOR_ADMIN', false),
        FILTER_VALIDATE_BOOL,
    ),

    /*
    |--------------------------------------------------------------------------
    | Challenge lifetime
    |--------------------------------------------------------------------------
    | How long the half-finished sign-in stays open after the password is
    | accepted. Long enough to unlock a phone and find the app; short enough
    | that a challenge left on a shared screen goes stale.
    */
    'challenge_ttl_seconds' => (int) env('TWO_FACTOR_CHALLENGE_TTL', 300),

    /*
    |--------------------------------------------------------------------------
    | Attempts per challenge
    |--------------------------------------------------------------------------
    | A 6-digit code is a million guesses, but only ~1 in 3 of those is live at
    | any moment across the drift window. Burning the challenge after a handful
    | of wrong codes means an attacker holding a stolen password has to redo
    | the password step for every few guesses.
    */
    'max_attempts_per_challenge' => (int) env('TWO_FACTOR_MAX_ATTEMPTS', 5),
];
