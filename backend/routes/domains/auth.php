<?php

declare(strict_types=1);

use App\Http\Controllers\Api\Auth\CustomerAuthController;
use App\Http\Controllers\Api\Auth\StaffAuthController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\Orders\OrderCreationController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Authentication routes (staff, customer, driver)
|--------------------------------------------------------------------------
| Loaded from routes/api.php after public ordering/bootstrap routes.
*/

/*
|--------------------------------------------------------------------------
| Staff Authentication Routes
|--------------------------------------------------------------------------
| Bearer-token login — CSRF except list is in bootstrap/app.php (api/auth/staff/*).
*/
Route::prefix('auth/staff')->group(function () {
    // Route throttle is IP-based and intentionally lenient (CGNAT / shared office).
    // Per-identity enforcement lives in StaffAuthController + StaffAuthRateLimit.
    Route::post('/pin-login', [StaffAuthController::class, 'pinLogin'])
        ->middleware('throttle:staff-login');
    Route::post('/pos-password-login', [StaffAuthController::class, 'posPasswordLogin'])
        ->middleware('throttle:staff-login');
    Route::post('/login', [StaffAuthController::class, 'phoneLogin'])
        ->middleware('throttle:staff-login');
    // Second step of an admin sign-in. Anonymous by necessity — nothing is
    // signed in until this succeeds; the challenge token is the only handle.
    Route::post('/two-factor-challenge', [StaffAuthController::class, 'twoFactorChallenge'])
        ->middleware('throttle:staff-login');
    Route::post('/password/reset-request', [StaffAuthController::class, 'passwordResetRequest'])
        ->middleware('throttle:5,1');
    Route::post('/password/reset-verify', [StaffAuthController::class, 'passwordResetVerify'])
        ->middleware('throttle:5,1');
});

/*
|--------------------------------------------------------------------------
| Customer Authentication Routes
|--------------------------------------------------------------------------
| Cross-app auth (Blade site ↔ /order SPA) uses the shared Laravel session
| cookie via Sanctum statefulApi() in bootstrap/app.php. Sanctum starts the
| session only when Referer/Origin matches SANCTUM_STATEFUL_DOMAINS.
|
| Do NOT add StartSession to this route group — a second session stack can
| rewrite the session cookie without the same EncryptCookies pipeline and
| corrupt the Blade site's session. Rely on EnsureFrontendRequestsAreStateful.
|
| Logout from Blade sets a short-lived JS-readable _cauth_revoked cookie so
| open /order tabs clear local auth state; the SPA still re-probes /check.
|--------------------------------------------------------------------------
*/
// Guest abandoned-cart snapshot (pre-login). Throttled — phone required.
Route::post('/cart/snapshot-guest', [App\Http\Controllers\Api\CustomerCartController::class, 'snapshotGuest'])
    ->middleware('throttle:20,1');

Route::prefix('auth/customer')
    ->group(function () {
        // OTP flow — route throttle is intentionally lenient (IP-based, CGNAT-safe).
        // Real per-phone enforcement is inside CustomerAuthController (20 req / 5 min per phone).
        Route::post('/otp/request', [CustomerAuthController::class, 'requestOtp'])
            ->middleware('throttle:customer-auth');
        Route::post('/otp/verify', [CustomerAuthController::class, 'verifyOtp'])
            ->middleware('throttle:customer-auth');

        // Does this phone have an account / a password? 10 a minute per IP
        // and number, 120 per IP (AppServiceProvider, 2026-10-06).
        Route::post('/check-phone', [CustomerAuthController::class, 'checkPhone'])
            ->middleware('throttle:customer-phone-check');

        // New: password-based login (no SMS cost for returning customers)
        // Route-level throttle is intentionally lenient — the controller uses a
        // tighter per-phone+IP RateLimiter so shared carrier IPs don't cause false lockouts.
        Route::post('/login', [CustomerAuthController::class, 'passwordLogin'])
            ->middleware('throttle:customer-auth-strict');

        // New: check if already authenticated via session cookie
        // React app calls this on mount to auto-login customers from Blade session
        // Called once per app open by every phone behind the same public IP
        // (phone audit, 2026-09-21). It reads a session and writes nothing, so
        // it is budgeted like the other public reads, not like the OTP routes.
        // Which social sign-in buttons to show, and a sign-in waiting for the phone (iruali import plan, feature 1).
        Route::get('/social', [App\Http\Controllers\Api\CustomerSocialController::class, 'show'])
            ->middleware('throttle:60,1');
        Route::get('/check', [CustomerAuthController::class, 'check'])
            ->middleware('throttle:120,1');

        // Password reset — controller guards per-phone (5 req / 30 min per phone).
        Route::post('/forgot-password', [CustomerAuthController::class, 'forgotPassword'])
            ->middleware('throttle:customer-auth-strict');
        Route::post('/reset-password', [CustomerAuthController::class, 'resetPassword'])
            ->middleware('throttle:customer-auth-strict');

        // Guest checkout — name + phone only (no OTP).
        // Gated by customer_registration overlay (does NOT affect otp/verify/login/check
        // so existing customers can always sign in and track orders).
        Route::get('/guest-rules', [App\Http\Controllers\Api\CustomerPhoneController::class, 'guestRules'])
            ->middleware('throttle:60,1');
        Route::post('/guest-session', [CustomerAuthController::class, 'guestSession'])
            ->middleware(['throttle:customer-auth-strict', 'service.available:customer_registration']);
    });

// Staff logout — requires a staff Sanctum token
Route::middleware(['auth:sanctum', 'staff.token'])->post('/auth/logout', [StaffAuthController::class, 'logout']);
// Kill every token this account holds — for a lost phone or a till left signed in.
Route::middleware(['auth:sanctum', 'staff.token'])->post('/auth/logout-everywhere', [StaffAuthController::class, 'logoutEverywhere']);

// Managing your own second factor, from My Account in the admin panel.
Route::middleware(['auth:sanctum', 'staff.token'])->prefix('auth/two-factor')->group(function (): void {
    Route::get('/', [App\Http\Controllers\Api\Auth\TwoFactorController::class, 'status']);
    Route::post('/setup', [App\Http\Controllers\Api\Auth\TwoFactorController::class, 'setup']);
    Route::post('/confirm', [App\Http\Controllers\Api\Auth\TwoFactorController::class, 'confirm']);
    Route::post('/recovery-codes', [App\Http\Controllers\Api\Auth\TwoFactorController::class, 'regenerateRecoveryCodes']);
    Route::delete('/', [App\Http\Controllers\Api\Auth\TwoFactorController::class, 'disable']);
});

// Customer API logout — revokes the current Sanctum token
Route::middleware(['auth:sanctum', 'customer.token'])->post('/auth/customer/logout', [CustomerAuthController::class, 'logout']);

/*
|--------------------------------------------------------------------------
| Protected Customer Routes
|--------------------------------------------------------------------------
| Customer ability checked in controllers
*/
Route::middleware(['auth:sanctum', 'customer.token'])->prefix('customer')->group(function () {
    Route::get('/me', [CustomerController::class, 'me']);
    Route::get('/credit', [CustomerController::class, 'credit']);
    Route::get('/deposit', [CustomerController::class, 'deposit']);
    Route::get('/deposit/ledger', [CustomerController::class, 'depositLedger']);
    Route::patch('/credit/preferences', [CustomerController::class, 'updateCreditPreferences']);
    Route::get('/orders', [CustomerController::class, 'orders']);
    Route::get('/orders/{id}', [CustomerController::class, 'show']);
    Route::post('/orders/{id}/cancel', [CustomerController::class, 'cancelOrder']);
    Route::post('/orders', [OrderCreationController::class, 'storeCustomer']);
    // The wallet (iruali import plan, feature 12): a gift card into it, and paying an order from it.
    Route::post('/wallet/gift-card', [App\Http\Controllers\Api\CustomerWalletController::class, 'addGiftCard'])->middleware('throttle:10,10');
    Route::post('/orders/{id}/pay-wallet', [App\Http\Controllers\Api\CustomerWalletController::class, 'payOrder'])->whereNumber('id')->middleware('throttle:20,1');
    // Part of an order from the wallet, the rest by card (owner, 2026-10-21): a hold until the bank confirms.
    Route::post('/orders/{id}/hold-wallet', [App\Http\Controllers\Api\CustomerWalletController::class, 'holdForOrder'])->whereNumber('id')->middleware('throttle:20,1');
    Route::delete('/orders/{id}/hold-wallet', [App\Http\Controllers\Api\CustomerWalletController::class, 'releaseHold'])->whereNumber('id')->middleware('throttle:20,1');
    // An online order on the credit account (phase 4, owner 2026-10-21).
    Route::post('/orders/{id}/pay-credit', [App\Http\Controllers\Api\CustomerCreditPaymentController::class, 'payOrder'])->whereNumber('id')->middleware('throttle:20,1');
    // The credit account paid online as a whole (owner, 2026-10-21): the statement, Pay now, and how it went.
    Route::get('/credit/statement', [App\Http\Controllers\Api\CustomerCreditPaymentController::class, 'statement']);
    Route::post('/credit/pay', [App\Http\Controllers\Api\CustomerCreditPaymentController::class, 'start'])->middleware('throttle:10,10');
    Route::get('/credit/payments/{token}', [App\Http\Controllers\Api\CustomerCreditPaymentController::class, 'show'])
        ->where('token', '[A-Za-z0-9]+')->middleware('throttle:60,1');
    // Money into the wallet by card (owner, 2026-10-21): the rules, start one, and how it went.
    Route::get('/wallet/top-ups/rules', [App\Http\Controllers\Api\CustomerWalletTopUpController::class, 'rules']);
    Route::post('/wallet/top-ups', [App\Http\Controllers\Api\CustomerWalletTopUpController::class, 'start'])->middleware('throttle:10,10');
    Route::get('/wallet/top-ups/{token}', [App\Http\Controllers\Api\CustomerWalletTopUpController::class, 'show'])
        ->where('token', '[A-Za-z0-9]+')->middleware('throttle:60,1');
    Route::patch('/profile', [CustomerController::class, 'update']);
    Route::post('/erasure-request', [App\Http\Controllers\Api\CustomerErasureRequestController::class, 'store'])
        ->middleware('throttle:6,10');
    // A guest checks the number they typed, and collects the points held back (2026-10-18).
    Route::get('/phone', [App\Http\Controllers\Api\CustomerPhoneController::class, 'show']);
    Route::post('/phone/send-code', [App\Http\Controllers\Api\CustomerPhoneController::class, 'sendCode'])->middleware('throttle:6,10');
    Route::post('/phone/verify', [App\Http\Controllers\Api\CustomerPhoneController::class, 'verify'])->middleware('throttle:10,10');
    // Prove the account's email with a 6-digit code (iruali import plan, feature 2).
    Route::post('/email/send-code', [App\Http\Controllers\Api\CustomerEmailController::class, 'sendCode'])->middleware('throttle:6,10');
    // "Tell me when it's back / on sale" (iruali import plan, feature 8).
    Route::get('/item-alerts', [App\Http\Controllers\Api\CustomerItemAlertController::class, 'index']);
    Route::post('/items/{item}/alert', [App\Http\Controllers\Api\CustomerItemAlertController::class, 'store'])->whereNumber('item')->middleware('throttle:30,1');
    Route::delete('/items/{item}/alert', [App\Http\Controllers\Api\CustomerItemAlertController::class, 'destroy'])->whereNumber('item');
    Route::delete('/social/{provider}', [App\Http\Controllers\Api\CustomerSocialController::class, 'unlink'])
        ->whereIn('provider', ['google', 'facebook', 'apple']);
    Route::post('/email/verify', [App\Http\Controllers\Api\CustomerEmailController::class, 'verify'])->middleware('throttle:12,10');
    Route::post('/cart/snapshot', [App\Http\Controllers\Api\CustomerCartController::class, 'snapshot']);
    Route::get('/addresses', [App\Http\Controllers\Api\CustomerAddressController::class, 'index']);
    Route::post('/addresses', [App\Http\Controllers\Api\CustomerAddressController::class, 'store']);
    Route::patch('/addresses/{id}', [App\Http\Controllers\Api\CustomerAddressController::class, 'update']);
    Route::delete('/addresses/{id}', [App\Http\Controllers\Api\CustomerAddressController::class, 'destroy']);
    Route::post('/addresses/{id}/default', [App\Http\Controllers\Api\CustomerAddressController::class, 'setDefault']);

    // Profile completion and password management
    Route::post('/complete-profile', [App\Http\Controllers\Api\CustomerProfileController::class, 'completeProfile']);
    Route::post('/change-password', [App\Http\Controllers\Api\CustomerProfileController::class, 'changePassword']);

    Route::get('/event-orders', [App\Http\Controllers\Api\EventOrderController::class, 'index'])
        ->middleware('throttle:30,1');
    Route::get('/event-orders/{reference}', [App\Http\Controllers\Api\EventOrderController::class, 'show'])
        ->middleware('throttle:30,1');
    // Authenticated drafts — allow more than the default 10/min so quote retries
    // during a single planning session do not surface "Too Many Attempts".
    Route::post('/event-orders', [App\Http\Controllers\Api\EventOrderController::class, 'store'])
        ->middleware('throttle:30,1');

    // Stage E — shop-facing wholesale (own trade account only)
    Route::get('/trade/deliveries', [App\Http\Controllers\Api\CustomerTradeController::class, 'deliveries']);
    Route::get('/trade/deliveries/{id}', [App\Http\Controllers\Api\CustomerTradeController::class, 'showDelivery'])
        ->whereNumber('id');
    Route::post('/trade/deliveries/{id}/report-sales', [App\Http\Controllers\Api\CustomerTradeController::class, 'reportSales'])
        ->whereNumber('id');
    Route::get('/trade/statement', [App\Http\Controllers\Api\CustomerTradeController::class, 'statement']);
    Route::get('/trade/invoices/{id}/pdf', [App\Http\Controllers\Api\CustomerTradeController::class, 'invoicePdf'])
        ->whereNumber('id');
    Route::post('/trade/invoices/{id}/pay', [App\Http\Controllers\Api\CustomerTradeController::class, 'payInvoice'])
        ->whereNumber('id');
});

// ─── Driver Auth (public — PIN login) ──────────────────────────────────────
Route::post('/auth/driver/pin-login', [App\Http\Controllers\Api\DriverAuthController::class, 'pinLogin'])
    ->middleware('throttle:5,1');

// ─── Driver API (authenticated driver only) ─────────────────────────────────
Route::middleware(['auth:sanctum', 'driver.token'])->group(function (): void {
    // Auth
    Route::get('/driver/me', [App\Http\Controllers\Api\DriverAuthController::class, 'me']);
    Route::post('/auth/driver/logout', [App\Http\Controllers\Api\DriverAuthController::class, 'logout']);

    // Deliveries
    Route::get('/driver/deliveries', [App\Http\Controllers\Api\DriverDeliveryController::class, 'index']);
    Route::get('/driver/deliveries/history', [App\Http\Controllers\Api\DriverDeliveryController::class, 'history']);
    Route::get('/driver/deliveries/{order}', [App\Http\Controllers\Api\DriverDeliveryController::class, 'show']);
    Route::patch('/driver/deliveries/{order}/status', [App\Http\Controllers\Api\DriverDeliveryController::class, 'updateStatus']);
    Route::post('/driver/deliveries/{order}/proof', [App\Http\Controllers\Api\DriverProofController::class, 'store']);
    Route::get('/driver/stats', [App\Http\Controllers\Api\DriverDeliveryController::class, 'stats']);

    // Location (push from driver app)
    Route::post('/driver/location', [App\Http\Controllers\Api\DriverLocationController::class, 'store']);
});

// ─── Driver Location for customers / staff / assigned driver ────────────────
Route::middleware(['auth:sanctum', 'staff_customer_or_driver.token'])->group(function (): void {
    Route::get('/driver/deliveries/{order}/location', [App\Http\Controllers\Api\DriverLocationController::class, 'forOrder'])
        ->middleware('throttle:60,1');
});
