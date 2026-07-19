<?php

declare(strict_types=1);

use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\Orders\OrderTrackingController;
use App\Http\Controllers\Api\ReceiptController;
use Illuminate\Support\Facades\Route;

require __DIR__ . '/domains/_helpers.php';

$GLOBALS['routes_loaded'] = [];
$GLOBALS['routes_sections'] = [];

// Health check endpoint
Route::get('/health', [App\Http\Controllers\Api\SystemHealthController::class, 'public']);

// Public order tracking — no auth required, token in URL acts as shared secret
Route::get('/orders/track/{token}', [OrderTrackingController::class, 'trackByToken'])
    ->middleware('throttle:10,1');

// ── Prayer Times (public, throttled) ─────────────────────────────────────────
Route::middleware('throttle:60,1')
    ->prefix('prayer-times')
    ->group(function () {
        Route::get('islands', [App\Http\Controllers\Api\Prayer\IslandsController::class, 'index']);
        Route::get('nearest', App\Http\Controllers\Api\Prayer\NearestIslandController::class);
        Route::get('', App\Http\Controllers\Api\Prayer\PrayerTimesApiController::class);
    });

Route::get('/gst/bootstrap', [App\Http\Controllers\Api\GstBootstrapController::class, 'show'])
    ->middleware('throttle:120,1');

Route::get('/opening-hours/status', [App\Http\Controllers\Api\OpeningHoursController::class, 'status'])
    ->middleware('throttle:120,1');

Route::get('/opening-hours', [App\Http\Controllers\Api\OpeningHoursController::class, 'index'])
    ->middleware('throttle:60,1');

Route::get('/ordering/eligibility', [App\Http\Controllers\Api\OrderingEligibilityController::class, 'show'])
    ->middleware('throttle:120,1');

Route::get('/ordering/status', [App\Http\Controllers\Api\OnlineOrderingController::class, 'status'])
    ->middleware('throttle:120,1');

Route::get('/ordering/delivery-status', [App\Http\Controllers\Api\DeliveryStatusController::class, 'show'])
    ->middleware('throttle:120,1');

Route::get('/ordering/delivery-fee-preview', [App\Http\Controllers\Api\DeliveryFeePreviewController::class, 'show'])
    ->middleware('throttle:120,1');

Route::match(['get', 'post'], '/ordering/checkout-fees-preview', [App\Http\Controllers\Api\CheckoutFeesPreviewController::class, 'show'])
    ->middleware('throttle:120,1');

Route::get('/ordering/pickup-slots', [App\Http\Controllers\Api\PickupSlotController::class, 'index'])
    ->middleware('throttle:120,1');

require __DIR__ . '/domains/auth.php';

Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
    $GLOBALS['routes_sections']['staff'] = 'protected';
    require __DIR__ . '/domains/staff.php';
    require __DIR__ . '/domains/devices.php';

    $GLOBALS['routes_sections']['orders'] = 'core';
    require __DIR__ . '/domains/orders.php';

    $GLOBALS['routes_sections']['kitchen'] = 'kds';
    require __DIR__ . '/domains/kitchen.php';

    $GLOBALS['routes_sections']['inventory'] = 'staff';
    require __DIR__ . '/domains/inventory.php';

    require __DIR__ . '/domains/finance.php';

    $GLOBALS['routes_sections']['kitchen'] = 'production';
    require __DIR__ . '/domains/kitchen.php';

    $GLOBALS['routes_sections']['orders'] = 'pos_ops';
    require __DIR__ . '/domains/orders.php';

    $GLOBALS['routes_sections']['reporting'] = 'reports';
    require __DIR__ . '/domains/reporting.php';

    $GLOBALS['routes_sections']['orders'] = 'tables';
    require __DIR__ . '/domains/orders.php';

    $GLOBALS['routes_sections']['marketing'] = 'sms_promotions';
    require __DIR__ . '/domains/marketing.php';

    $GLOBALS['routes_sections']['catalog'] = 'barcode';
    require __DIR__ . '/domains/catalog.php';
});

Route::get('/receipts/{token}', [ReceiptController::class, 'show']);
Route::post('/receipts/{token}/feedback', [ReceiptController::class, 'feedback'])
    ->middleware('throttle:10,10');

Route::post('/customer/sms/opt-out', [CustomerController::class, 'optOut'])
    ->middleware('throttle:5,10');

$GLOBALS['routes_sections']['catalog'] = 'main';
require __DIR__ . '/domains/catalog.php';

require __DIR__ . '/domains/payments.php';

$GLOBALS['routes_sections']['marketing'] = 'public';
require __DIR__ . '/domains/marketing.php';

require __DIR__ . '/domains/loyalty.php';

$GLOBALS['routes_sections']['orders'] = 'delivery';
require __DIR__ . '/domains/orders.php';

$GLOBALS['routes_sections']['devices'] = 'streams';
require __DIR__ . '/domains/devices.php';

$GLOBALS['routes_sections']['marketing'] = 'sms_admin';
require __DIR__ . '/domains/marketing.php';

$GLOBALS['routes_sections']['staff'] = 'admin';
require __DIR__ . '/domains/staff.php';

$GLOBALS['routes_sections']['reporting'] = 'analytics';
require __DIR__ . '/domains/reporting.php';

$GLOBALS['routes_sections']['kitchen'] = 'wait_time';
require __DIR__ . '/domains/kitchen.php';

$GLOBALS['routes_sections']['inventory'] = 'waste';
require __DIR__ . '/domains/inventory.php';

require __DIR__ . '/domains/reservations.php';

require __DIR__ . '/domains/admin_customers.php';

Route::get('/site-settings/public', [App\Http\Controllers\Api\SiteSettingsController::class, 'public'])
    ->middleware('throttle:60,1');

Route::get('/system/health', [App\Http\Controllers\Api\SystemHealthController::class, 'public']);
