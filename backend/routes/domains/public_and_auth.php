// Health check endpoint
Route::get('/health', [App\Http\Controllers\Api\SystemHealthController::class, 'public']);

// Public order tracking — no auth required, token in URL acts as shared secret
Route::get('/orders/track/{token}', [OrderController::class, 'trackByToken'])
    ->middleware('throttle:10,1');

// ── Prayer Times (public, throttled) ─────────────────────────────────────────
Route::middleware('throttle:60,1')
    ->prefix('prayer-times')
    ->group(function () {
        Route::get('islands', [App\Http\Controllers\Api\Prayer\IslandsController::class, 'index']);
        Route::get('nearest', App\Http\Controllers\Api\Prayer\NearestIslandController::class);
        Route::get('', App\Http\Controllers\Api\Prayer\PrayerTimesApiController::class);
    });

// Opening hours status (public - for online order app)
Route::get('/gst/bootstrap', [App\Http\Controllers\Api\GstBootstrapController::class, 'show'])
    ->middleware('throttle:120,1');

Route::get('/opening-hours/status', [App\Http\Controllers\Api\OpeningHoursController::class, 'status'])
    ->middleware('throttle:120,1');

// Full weekly schedule (public - for HoursPage in React app)
Route::get('/opening-hours', [App\Http\Controllers\Api\OpeningHoursController::class, 'index'])
    ->middleware('throttle:60,1');

// Delivery + chef menu eligibility (public — online order app)
Route::get('/ordering/eligibility', [App\Http\Controllers\Api\OrderingEligibilityController::class, 'show'])
    ->middleware('throttle:120,1');

// Global online ordering gate status (public — order app banner)
Route::get('/ordering/status', [App\Http\Controllers\Api\OnlineOrderingController::class, 'status'])
    ->middleware('throttle:120,1');

// Delivery-specific gate status (public — shows delivery schedule + zone info)
Route::get('/ordering/delivery-status', [App\Http\Controllers\Api\DeliveryStatusController::class, 'show'])
    ->middleware('throttle:120,1');

// Delivery fee preview — matches server-side DeliveryFeeCalculator at checkout
Route::get('/ordering/delivery-fee-preview', [App\Http\Controllers\Api\DeliveryFeePreviewController::class, 'show'])
    ->middleware('throttle:120,1');

Route::get('/ordering/checkout-fees-preview', [App\Http\Controllers\Api\CheckoutFeesPreviewController::class, 'show'])
    ->middleware('throttle:120,1');

Route::get('/ordering/pickup-slots', [App\Http\Controllers\Api\PickupSlotController::class, 'index'])
    ->middleware('throttle:120,1');

/*
|--------------------------------------------------------------------------
| Staff Authentication Routes
|--------------------------------------------------------------------------
*/
Route::prefix('auth/staff')->group(function () {
    Route::post('/pin-login', [StaffAuthController::class, 'pinLogin'])
        ->middleware('throttle:10,1');
    Route::post('/login', [StaffAuthController::class, 'phoneLogin'])
        ->middleware('throttle:10,1');
    Route::post('/password/reset-request', [StaffAuthController::class, 'passwordResetRequest'])
        ->middleware('throttle:5,1');
    Route::post('/password/reset-verify', [StaffAuthController::class, 'passwordResetVerify'])
        ->middleware('throttle:5,1');
});

/*
|--------------------------------------------------------------------------
| Customer Authentication Routes
|--------------------------------------------------------------------------
| NOTE: No StartSession here — adding StartSession to API routes causes the
| session cookie to be rewritten without EncryptCookies, which corrupts the
| Blade site's session and logs users out of the main website.
| Cross-app auth is handled via a short-lived _cauth handoff cookie set
| by the Blade login controller (CustomerPortalController).
|--------------------------------------------------------------------------
*/
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

        // Guest checkout — name + phone only (no OTP)
        Route::post('/guest-session', [CustomerAuthController::class, 'guestSession'])
            ->middleware('throttle:30,1');
    });

// Staff logout — requires a staff Sanctum token
Route::middleware(['auth:sanctum', 'staff.token'])->post('/auth/logout', [StaffAuthController::class, 'logout']);

// Customer API logout — revokes the current Sanctum token
Route::middleware(['auth:sanctum', 'customer.token'])->post('/auth/customer/logout', [CustomerAuthController::class, 'logout']);

/*
|--------------------------------------------------------------------------
| Protected Staff Routes
|--------------------------------------------------------------------------
*/
