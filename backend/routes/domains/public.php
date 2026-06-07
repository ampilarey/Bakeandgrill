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
