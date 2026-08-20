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
            ->middleware('throttle:60,1');
        Route::post('/otp/verify', [CustomerAuthController::class, 'verifyOtp'])
            ->middleware('throttle:60,1');

        // New: check if phone exists and has a password
        Route::post('/check-phone', [CustomerAuthController::class, 'checkPhone'])
            ->middleware('throttle:30,1');

        // New: password-based login (no SMS cost for returning customers)
        // Route-level throttle is intentionally lenient — the controller uses a
        // tighter per-phone+IP RateLimiter so shared carrier IPs don't cause false lockouts.
        Route::post('/login', [CustomerAuthController::class, 'passwordLogin'])
            ->middleware('throttle:30,1');

        // New: check if already authenticated via session cookie
        // React app calls this on mount to auto-login customers from Blade session
        Route::get('/check', [CustomerAuthController::class, 'check'])
            ->middleware('throttle:20,1');

        // Password reset — controller guards per-phone (5 req / 30 min per phone).
        Route::post('/forgot-password', [CustomerAuthController::class, 'forgotPassword'])
            ->middleware('throttle:30,1');
        Route::post('/reset-password', [CustomerAuthController::class, 'resetPassword'])
            ->middleware('throttle:30,1');

        // Guest checkout — name + phone only (no OTP).
        // Gated by customer_registration overlay (does NOT affect otp/verify/login/check
        // so existing customers can always sign in and track orders).
        Route::post('/guest-session', [CustomerAuthController::class, 'guestSession'])
            ->middleware(['throttle:30,1', 'service.available:customer_registration']);
    });

// Staff logout — requires a staff Sanctum token
Route::middleware(['auth:sanctum', 'staff.token'])->post('/auth/logout', [StaffAuthController::class, 'logout']);
// Kill every token this account holds — for a lost phone or a till left signed in.
Route::middleware(['auth:sanctum', 'staff.token'])->post('/auth/logout-everywhere', [StaffAuthController::class, 'logoutEverywhere']);

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
    Route::patch('/profile', [CustomerController::class, 'update']);
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
