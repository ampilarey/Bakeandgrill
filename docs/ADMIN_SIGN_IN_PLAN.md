# Admin sign-in: ideas kept for later

Owner, 2026-10-26: "can u check how admin login is done, is there any better way?", then "keep
this for later". Nothing here is built yet.

## How it works now

- Password tab: mobile or email and the admin password (`POST /api/auth/staff/login`).
- PIN tab: the till's 4 to 8 digit PIN (`POST /api/auth/staff/pin-login`, `intent: admin`),
  added 2026-10-11 so a cashier given Print labels can reach Admin. It opens Admin for any
  account with `admin.access`, owners included.
- A two-step code (authenticator app, recovery codes) is asked only of accounts that set one
  up; `TWO_FACTOR_REQUIRED_FOR_ADMIN` is off.
- Limits: 8 wrong tries per network and 20 per account in 10 minutes, 30 per account per day
  (`StaffAccountLock`, the owner is texted). Same message for every failure, every try audited.
- A browser stays signed in 30 days (`STAFF_REMEMBER_DAYS`). Forgot password is an SMS code,
  and a reset signs the person out everywhere.

## What is weak

1. A 4-digit PIN falls to about a year of guessing at 30 tries a day, and it opens Admin for
   owners and managers too.
2. Two-step codes are optional, so an owner account may rest on one password or PIN.
3. The page opens on Password every time; PIN users tap PIN on every sign-in.

## Recommended, best first

1. **Face ID or fingerprint (passkeys, WebAuthn)**: "Sign in with Face ID" on the phone,
   password as the fallback. Nothing to guess or phish. Needs one server library.
2. **PIN into Admin only for small roles**: staff without money, staff or settings
   permissions (label-only cashiers), and 6 digits; owners and managers use a password or passkey.
3. **Two-step codes required for owners and managers only**, after each has enrolled.
4. Small things: remember the last number and tab on the device; say "You'll stay signed in
   on this device for 30 days" under the button.

1 and 2 together are the suggested first step.
