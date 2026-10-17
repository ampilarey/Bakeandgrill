# Sign in with Google, Facebook and Apple (customers)

Customers can sign in to the order app with Google, Facebook or Apple as well as
with their phone number. Staff cannot: they sign in with phone and PIN.

## How it works

1. The customer taps **Continue with Google** (or Facebook, Apple) on the sign-in
   step. The button shows only when that provider's keys are in `.env`.
2. They sign in at the provider and come back to the page they started on.
3. Bake & Grill decides who they are:
   - A Google, Facebook or Apple account linked before: signed in.
   - Otherwise, a customer whose **checked** email matches, when the provider says
     the email is verified: linked and signed in.
   - Otherwise: the order app says "Almost done. Enter your phone number to finish
     signing in with Google." The customer enters their phone and the usual SMS
     code. The sign-in is then linked to that phone's account (a new account is
     made if the phone is new). Every order needs a phone, so a social sign-in
     never makes an account without one.
4. Account → **Sign-in methods** lists the linked accounts with **Unlink**. The
   phone always works.

A sign-in whose email or phone belongs to an active staff member is refused.

## Setting up each provider

The redirect (callback) URL to register is
`https://<site>/auth/social/<provider>/callback`, for example
`https://bakeandgrill.mv/auth/social/google/callback`. TEST
(`https://test.bakeandgrill.mv/...`) needs its own registration or its own app.
After editing `.env`, run `php artisan config:cache`.

### Google (free)

1. Google Cloud Console → APIs & Services → **OAuth consent screen**: External, app
   name "Bake & Grill", support email, logo, and the website, privacy and terms
   links. Scopes: `openid`, `email`, `profile`. Publish it.
2. **Credentials → Create credentials → OAuth client ID**, type Web application.
   Authorised redirect URI: the callback URL above.
3. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Facebook (free)

1. developers.facebook.com → **Create app**, use case "Authenticate and request data
   from users with Facebook Login".
2. Facebook Login → Settings: Valid OAuth Redirect URIs = the callback URL above.
3. App settings → Basic: add the privacy policy and terms URLs, then switch the app
   to **Live**.
4. Copy the App ID and App secret into `FACEBOOK_CLIENT_ID` and
   `FACEBOOK_CLIENT_SECRET`. Facebook does not say whether an email is verified,
   so a Facebook sign-in always goes through the phone step the first time.

### Apple (needs a paid Apple Developer account)

1. developer.apple.com → Certificates, Identifiers & Profiles → **Identifiers**: an
   App ID with "Sign in with Apple", then a **Services ID** (for example
   `mv.bakeandgrill.web`) with Sign in with Apple configured: domain
   `bakeandgrill.mv`, return URL the callback URL above.
2. **Keys** → create a key with Sign in with Apple, download the `.p8` file (only
   once).
3. `.env`: `APPLE_CLIENT_ID` = the Services ID, `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
   and either `APPLE_PRIVATE_KEY` (the file's contents, `\n` for line breaks) or
   `APPLE_PRIVATE_KEY_PATH` (a path to the file outside `public/`).
4. Apple sends the person's name only the first time; it is saved then. Apple's
   private relay emails (`…@privaterelay.appleid.com`) are accepted.

## Where the code is

- `app/Domains/Auth/SocialLogin/*`: the providers (OAuth 2 / OpenID Connect with
  state, nonce and PKCE where supported), ported from iruali.
- `app/Domains/Auth/Services/SocialLoginService.php`: who the person is, pending
  sign-ins, linking, unlinking, Apple's form-post hand-over.
- `app/Http/Controllers/Auth/CustomerSocialLoginController.php`: `/auth/social/*`.
- `GET /api/auth/customer/social` (buttons and the waiting sign-in),
  `DELETE /api/customer/social/{provider}`; a waiting sign-in is linked in
  `CustomerAuthController` after the phone code or password signs the customer in.
- Order app: `components/SocialSignIn.tsx`, Account → `SignInMethodsBlock`.
- Tests: `tests/Feature/Auth/CustomerSocialLoginTest.php`.
