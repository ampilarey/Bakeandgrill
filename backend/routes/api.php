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
// Readiness: 503 when a dependency is down. Point uptime monitoring here —
// /health stays 200 while the app can serve, so it cannot catch a dead queue.
Route::get('/health/ready', [App\Http\Controllers\Api\SystemHealthController::class, 'ready'])
    ->middleware('throttle:60,1');

// TEST-only immediate deploy trigger (GitHub Actions → cPanel). Disabled when
// TEST_DEPLOY_WEBHOOK_SECRET is unset; always 404 on non-test hosts.
Route::post('/deploy/test-pull', App\Http\Controllers\Api\TestDeployWebhookController::class)
    ->middleware('throttle:10,1');

// Public order tracking — no auth required, token in URL acts as shared secret.
// Named limiter is token-keyed (CGNAT-safe); polling + WhatsApp preview must not 429.
Route::get('/orders/track/{token}', [OrderTrackingController::class, 'trackByToken'])
    ->middleware('throttle:public-order-track');

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

Route::get('/service-status', App\Http\Controllers\Api\ServiceStatusController::class)
    ->middleware('throttle:120,1');

// Restoration notify-me signup — public, per-IP throttled to 5/min.
// Generic-success response for new/duplicate/never-seen so we never leak the
// existence of a phone number. See plan §14.
Route::post('/service-status/notify-me', [App\Http\Controllers\Api\RestorationSubscriptionController::class, 'store'])
    ->middleware('throttle:5,1');

Route::get('/ordering/catering-status', [App\Http\Controllers\Api\OnlineOrderingController::class, 'cateringStatus'])
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
    require __DIR__ . '/domains/complaints.php';

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

    $GLOBALS['routes_sections']['social'] = 'admin';
    require __DIR__ . '/domains/social.php';

    $GLOBALS['routes_sections']['catalog'] = 'barcode';
    require __DIR__ . '/domains/catalog.php';
});

// Token-guarded like the tracking route above, and limited like it — this was
// the one public token endpoint with no limiter at all.
Route::get('/receipts/{token}', [ReceiptController::class, 'show'])
    ->middleware('throttle:public-order-track');
Route::post('/receipts/{token}/feedback', [ReceiptController::class, 'feedback'])
    ->middleware('throttle:10,10');
Route::post('/receipts/{token}/complaints', [App\Http\Controllers\Api\PublicComplaintController::class, 'storeForReceipt'])
    ->middleware('throttle:20,1');
Route::post('/invoices/{token}/complaints', [App\Http\Controllers\Api\PublicComplaintController::class, 'storeForInvoice'])
    ->middleware('throttle:20,1');
Route::post('/receipts/{token}/complaint-photos', [App\Http\Controllers\Api\ComplaintPhotoController::class, 'uploadForReceipt'])
    ->middleware('throttle:20,1');
Route::post('/invoices/{token}/complaint-photos', [App\Http\Controllers\Api\ComplaintPhotoController::class, 'uploadForInvoice'])
    ->middleware('throttle:20,1');

Route::get('/event-quotes/{token}', [App\Http\Controllers\Api\EventQuoteController::class, 'show'])
    ->middleware('throttle:30,1');
Route::post('/event-quotes/{token}/approve', [App\Http\Controllers\Api\EventQuoteController::class, 'approve'])
    ->middleware('throttle:10,1');

Route::post('/customer/sms/opt-out', [CustomerController::class, 'optOut'])
    ->middleware('throttle:5,10');

$GLOBALS['routes_sections']['catalog'] = 'main';
require __DIR__ . '/domains/catalog.php';

require __DIR__ . '/domains/payments.php';

$GLOBALS['routes_sections']['marketing'] = 'public';
require __DIR__ . '/domains/marketing.php';

$GLOBALS['routes_sections']['social'] = 'public';
require __DIR__ . '/domains/social.php';

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

require __DIR__ . '/domains/trade.php';

Route::get('/content', [App\Http\Controllers\Api\ContentController::class, 'public'])
    ->middleware('throttle:60,1');

// Order-app draft preview — requires opaque draft token (never public without it).
Route::get('/content/preview', [App\Http\Controllers\Api\ContentPreviewController::class, 'draftContent'])
    ->middleware('throttle:60,1');

// Home page layout blocks (public render path — one query per page).
Route::get('/page-blocks', [App\Http\Controllers\Api\PageBlockController::class, 'publicIndex'])
    ->middleware('throttle:60,1');

Route::get('/site-settings/public', [App\Http\Controllers\Api\SiteSettingsController::class, 'public'])
    ->middleware('throttle:60,1');

// POS close-shift currency photos — public map of face → custom photo URL.
Route::get('/currency-images', [App\Http\Controllers\Api\CurrencyImageController::class, 'index'])
    ->middleware('throttle:60,1');

require __DIR__ . '/domains/signage.php';

Route::get('/system/health', [App\Http\Controllers\Api\SystemHealthController::class, 'public']);
