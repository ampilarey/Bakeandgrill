<?php

declare(strict_types=1);

use App\Http\Controllers\Api\Auth\CustomerAuthController;
use App\Http\Controllers\Api\Auth\DeviceController;
use App\Http\Controllers\Api\Auth\StaffAuthController;
use App\Http\Controllers\Api\BmlWebhookController;
use App\Http\Controllers\Api\CashMovementController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\KdsController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PrintJobController;
use App\Http\Controllers\Api\PurchaseController;
use App\Http\Controllers\Api\ReceiptController;
use App\Http\Controllers\Api\RefundController;
use App\Http\Controllers\Api\ReportsController;
use App\Http\Controllers\Api\ShiftController;
use App\Http\Controllers\Api\SmsPromotionController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\ReservationController;
use App\Http\Controllers\Api\TableController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

// Health check endpoint
Route::get('/health', function () {
    return response()->json(['status' => 'ok']);
});

// ── Prayer Times (public, throttled) ─────────────────────────────────────────
Route::middleware('throttle:60,1')
    ->prefix('prayer-times')
    ->group(function () {
        Route::get('islands',  [App\Http\Controllers\Api\Prayer\IslandsController::class, 'index']);
        Route::get('nearest',  App\Http\Controllers\Api\Prayer\NearestIslandController::class);
        Route::get('',         App\Http\Controllers\Api\Prayer\PrayerTimesApiController::class);
    });

// Opening hours status (public - for online order app)
Route::get('/opening-hours/status', function () {
    $service = app(App\Services\OpeningHoursService::class);
    $open    = $service->isOpenNow();
    $message = null;
    if (! $open) {
        $message = $service->getClosureReason()
            ?? config('opening_hours.closed_message', 'We are currently closed. Please check our opening hours.');
    }

    return response()->json(['open' => $open, 'message' => $message]);
});

// Full weekly schedule (public - for HoursPage in React app)
Route::get('/opening-hours', function () {
    $service  = app(App\Services\OpeningHoursService::class);
    $schedule = config('opening_hours.hours', []);

    return response()->json([
        'schedule'       => $schedule,
        'open'           => $service->isOpenNow(),
        'closure_reason' => $service->getClosureReason(),
    ]);
});

/*
|--------------------------------------------------------------------------
| Staff Authentication Routes
|--------------------------------------------------------------------------
*/
Route::prefix('auth/staff')->group(function () {
    Route::post('/pin-login', [StaffAuthController::class, 'pinLogin'])
        ->middleware('throttle:10,1');
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
        // Existing OTP flow
        Route::post('/otp/request', [CustomerAuthController::class, 'requestOtp'])
            ->middleware('throttle:3,5');
        Route::post('/otp/verify', [CustomerAuthController::class, 'verifyOtp'])
            ->middleware('throttle:5,10');

        // New: check if phone exists and has a password
        Route::post('/check-phone', [CustomerAuthController::class, 'checkPhone'])
            ->middleware('throttle:10,1');

        // New: password-based login (no SMS cost for returning customers)
        Route::post('/login', [CustomerAuthController::class, 'passwordLogin'])
            ->middleware('throttle:5,5');

        // New: check if already authenticated via session cookie
        // React app calls this on mount to auto-login customers from Blade session
        Route::get('/check', [CustomerAuthController::class, 'check']);

        // New: password reset via OTP
        Route::post('/forgot-password', [CustomerAuthController::class, 'forgotPassword'])
            ->middleware('throttle:3,5');
        Route::post('/reset-password', [CustomerAuthController::class, 'resetPassword'])
            ->middleware('throttle:5,10');
    });

// Logout is available to both staff and customer tokens
Route::middleware('auth:sanctum')->post('/auth/logout', [StaffAuthController::class, 'logout']);

// Customer API logout — revokes the current Sanctum token
Route::middleware(['auth:sanctum', 'customer.token'])->post('/auth/customer/logout', [CustomerAuthController::class, 'logout']);

/*
|--------------------------------------------------------------------------
| Guest Order Routes (no authentication required)
|--------------------------------------------------------------------------
*/
Route::prefix('guest')->middleware('throttle:20,1')->group(function () {
    Route::post('/orders', [OrderController::class, 'storeGuest']);
    Route::get('/orders/{id}', [OrderController::class, 'showGuest']);
});

/*
|--------------------------------------------------------------------------
| Protected Staff Routes
|--------------------------------------------------------------------------
*/
Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
    // Get current user (staff)
    Route::get('/auth/me', [StaffAuthController::class, 'me']);

    // Device Management (Admin only)
    Route::prefix('devices')->middleware('can:device.manage')->group(function () {
        Route::post('/register', [DeviceController::class, 'register'])
            ->middleware('throttle:10,1');
        Route::get('/', [DeviceController::class, 'index']);
        Route::patch('/{id}/disable', [DeviceController::class, 'disable']);
        Route::patch('/{id}/enable', [DeviceController::class, 'enable']);
    });

    // Orders
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store'])
        ->middleware('device.active');
    Route::post('/orders/sync', [OrderController::class, 'sync'])
        ->middleware('device.active');
    Route::get('/orders/{id}', [OrderController::class, 'show']);
    Route::post('/orders/{id}/hold', [OrderController::class, 'hold'])->middleware('throttle:20,1');
    Route::post('/orders/{id}/resume', [OrderController::class, 'resume'])->middleware('throttle:20,1');
    Route::post('/orders/{id}/payments', [OrderController::class, 'addPayments'])->middleware('throttle:20,1');

    // KDS
    Route::get('/kds/orders', [KdsController::class, 'index']);
    Route::post('/kds/orders/{id}/start', [KdsController::class, 'start']);
    Route::post('/kds/orders/{id}/bump', [KdsController::class, 'bump']);
    Route::post('/kds/orders/{id}/recall', [KdsController::class, 'recall']);

    // Print jobs
    Route::get('/print-jobs', [PrintJobController::class, 'index']);
    Route::post('/print-jobs/{id}/retry', [PrintJobController::class, 'retry']);

    // Inventory — static paths MUST come before {id} wildcard to avoid shadowing
    Route::get('/inventory', [InventoryController::class, 'index']);
    Route::post('/inventory', [InventoryController::class, 'store']);
    Route::get('/inventory/low-stock', [InventoryController::class, 'lowStock']);
    Route::post('/inventory/stock-count', [InventoryController::class, 'stockCount']);
    Route::get('/inventory/{id}', [InventoryController::class, 'show']);
    Route::patch('/inventory/{id}', [InventoryController::class, 'update']);
    Route::post('/inventory/{id}/adjust', [InventoryController::class, 'adjust']);
    Route::get('/inventory/{id}/price-history', [InventoryController::class, 'priceHistory']);
    Route::get('/inventory/{id}/cheapest-supplier', [InventoryController::class, 'cheapestSupplier']);

    // Finance & Inventory Routes (invoices, expenses, reports, supplier intelligence,
    // purchase workflow, forecasting) — required HERE so static paths like
    // /suppliers/performance and /purchases/suggest are registered BEFORE the
    // {id} wildcard routes below, preventing route shadowing.
    require __DIR__ . '/api_finance.php';

    // Suppliers — read requires suppliers.view, write requires suppliers.manage
    Route::middleware('permission:suppliers.view')->group(function () {
        Route::get('/suppliers', [SupplierController::class, 'index']);
        Route::get('/suppliers/{id}', [SupplierController::class, 'show']);
    });
    Route::middleware('permission:suppliers.manage')->group(function () {
        Route::post('/suppliers', [SupplierController::class, 'store']);
        Route::patch('/suppliers/{id}', [SupplierController::class, 'update']);
        Route::delete('/suppliers/{id}', [SupplierController::class, 'destroy']);
    });

    // Purchases — all operations require suppliers.purchases
    Route::middleware('permission:suppliers.purchases')->group(function () {
        Route::get('/purchases', [PurchaseController::class, 'index']);
        Route::post('/purchases', [PurchaseController::class, 'store']);
        Route::get('/purchases/{id}', [PurchaseController::class, 'show']);
        Route::patch('/purchases/{id}', [PurchaseController::class, 'update']);
        Route::post('/purchases/{id}/receipts', [PurchaseController::class, 'uploadReceipt']);
        Route::post('/purchases/import', [PurchaseController::class, 'import']);
    });

    // Shifts + cash drawer
    Route::get('/shifts/current', [ShiftController::class, 'current']);
    Route::post('/shifts/open', [ShiftController::class, 'open'])->middleware('throttle:5,1');
    Route::post('/shifts/{id}/close', [ShiftController::class, 'close'])->middleware('throttle:5,1');
    Route::post('/shifts/{id}/cash-movements', [CashMovementController::class, 'store'])->middleware('throttle:30,1');

    // Reports
    Route::get('/reports/sales-summary', [ReportsController::class, 'salesSummary']);
    Route::get('/reports/sales-breakdown', [ReportsController::class, 'salesBreakdown']);
    Route::get('/reports/x-report', [ReportsController::class, 'xReport']);
    Route::get('/reports/z-report', [ReportsController::class, 'zReport']);
    Route::get('/reports/inventory-valuation', [ReportsController::class, 'inventoryValuation']);
    Route::get('/reports/sales-summary/csv', [ReportsController::class, 'salesSummaryCsv'])
        ->middleware('throttle:20,1');
    Route::get('/reports/sales-breakdown/csv', [ReportsController::class, 'salesBreakdownCsv'])
        ->middleware('throttle:20,1');
    Route::get('/reports/x-report/csv', [ReportsController::class, 'xReportCsv'])
        ->middleware('throttle:20,1');
    Route::get('/reports/z-report/csv', [ReportsController::class, 'zReportCsv'])
        ->middleware('throttle:20,1');
    Route::get('/reports/inventory-valuation/csv', [ReportsController::class, 'inventoryValuationCsv'])
        ->middleware('throttle:20,1');

    // Tables
    Route::get('/tables', [TableController::class, 'index']);
    Route::post('/tables', [TableController::class, 'store']);
    Route::patch('/tables/{id}', [TableController::class, 'update']);
    Route::post('/tables/{id}/open', [TableController::class, 'open'])
        ->middleware('device.active');
    Route::post('/tables/{tableId}/orders/{orderId}/items', [TableController::class, 'addItems'])
        ->middleware('device.active');
    Route::post('/tables/{id}/close', [TableController::class, 'close']);
    Route::post('/tables/merge', [TableController::class, 'merge']);
    Route::post('/tables/{id}/split', [TableController::class, 'split']);

    // Receipts (staff)
    Route::post('/receipts/{orderId}/send', [ReceiptController::class, 'send']);

    // Refunds
    Route::get('/refunds', [RefundController::class, 'index']);
    Route::get('/refunds/{id}', [RefundController::class, 'show']);
    Route::post('/orders/{orderId}/refunds', [RefundController::class, 'store'])->middleware('throttle:10,1');

    // SMS promotions
    Route::get('/sms/promotions', [SmsPromotionController::class, 'index']);
    Route::get('/sms/promotions/{id}', [SmsPromotionController::class, 'show']);
    Route::post('/sms/promotions/preview', [SmsPromotionController::class, 'preview'])
        ->middleware('throttle:10,5');
    Route::post('/sms/promotions/send', [SmsPromotionController::class, 'send'])
        ->middleware('throttle:5,60');
});

/*
|--------------------------------------------------------------------------
| Protected Customer Routes
|--------------------------------------------------------------------------
| Customer ability checked in controllers
*/
Route::middleware(['auth:sanctum', 'customer.token'])->prefix('customer')->group(function () {
    Route::get('/me', [CustomerController::class, 'me']);
    Route::get('/orders', [CustomerController::class, 'orders']);
    Route::get('/orders/{id}', [CustomerController::class, 'show']);
    Route::post('/orders', [OrderController::class, 'storeCustomer']);
    Route::patch('/profile', [CustomerController::class, 'update']);

    // Profile completion and password management
    Route::post('/complete-profile', [\App\Http\Controllers\Api\CustomerProfileController::class, 'completeProfile']);
    Route::post('/change-password',  [\App\Http\Controllers\Api\CustomerProfileController::class, 'changePassword']);
});

/*
|--------------------------------------------------------------------------
| Receipt Token Routes (Public)
|--------------------------------------------------------------------------
*/
Route::get('/receipts/{token}', [ReceiptController::class, 'show']);
Route::post('/receipts/{token}/resend', [ReceiptController::class, 'resend'])
    ->middleware('throttle:5,10');
Route::post('/receipts/{token}/feedback', [ReceiptController::class, 'feedback'])
    ->middleware('throttle:10,10');

// Customer SMS opt-out (throttled to prevent bulk unsubscribing)
Route::post('/customer/sms/opt-out', [CustomerController::class, 'optOut'])
    ->middleware('throttle:5,10');

// Staff-only: update internal notes on a customer profile
Route::middleware(['auth:sanctum', 'permission:customers.manage'])->group(function () {
    Route::patch('/customers/{id}/notes', [CustomerController::class, 'updateNotes']);
});

/*
|--------------------------------------------------------------------------
| Menu Management Routes (Public & Protected)
|--------------------------------------------------------------------------
*/

// Public menu access
Route::get('/categories', [CategoryController::class, 'index']);
Route::get('/categories/{id}', [CategoryController::class, 'show']);
Route::get('/items', [ItemController::class, 'index']);
Route::get('/items/{id}', [ItemController::class, 'show']);
Route::get('/items/barcode/{barcode}', [ItemController::class, 'lookupByBarcode']);

// Get stock info for multiple items
Route::post('/items/stock-check', [ItemController::class, 'bulkStockCheck'])
    ->middleware('throttle:60,1');

// Protected menu management (staff only — requires menu.manage permission)
Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->group(function () {
    // Categories
    Route::post('/categories', [CategoryController::class, 'store']);
    Route::patch('/categories/{id}', [CategoryController::class, 'update']);
    Route::delete('/categories/{id}', [CategoryController::class, 'destroy']);

    // Items
    Route::post('/items', [ItemController::class, 'store']);
    Route::get('/items/{id}/recipe', [ItemController::class, 'showWithRecipe']); // Staff-only recipe view
    Route::patch('/items/{id}', [ItemController::class, 'update']);
    Route::delete('/items/{id}', [ItemController::class, 'destroy']);
    Route::patch('/items/{id}/toggle-availability', [ItemController::class, 'toggleAvailability']);
});

// ─── BML Payment Gateway ─────────────────────────────────────────────────────

// Webhook — no auth, signature verified inside PaymentService::handleBmlWebhook
Route::post('/payments/bml/webhook', [BmlWebhookController::class, 'handle'])
    ->withoutMiddleware([Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class]);

// Initiate BML payment (customer only)
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/orders/{orderId}/pay/bml', [PaymentController::class, 'initiateOnline']);
});

// ─── Promotions ──────────────────────────────────────────────────────────────

// Public/customer — validate a code
Route::post('/promotions/validate', [App\Http\Controllers\Api\PromotionController::class, 'validate'])
    ->middleware('throttle:5,1');

// Authenticated customer/staff — apply/remove promo
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/orders/{orderId}/apply-promo', [App\Http\Controllers\Api\PromotionController::class, 'applyToOrder']);
    Route::delete('/orders/{orderId}/promo/{promotionId}', [App\Http\Controllers\Api\PromotionController::class, 'removeFromOrder']);
});

// Admin — full CRUD (requires promotions.manage permission)
Route::middleware(['auth:sanctum', 'permission:promotions.manage'])->prefix('admin')->group(function () {
    Route::get('/promotions', [App\Http\Controllers\Api\PromotionController::class, 'adminIndex']);
    Route::post('/promotions', [App\Http\Controllers\Api\PromotionController::class, 'adminStore']);
    Route::patch('/promotions/{id}', [App\Http\Controllers\Api\PromotionController::class, 'adminUpdate']);
    Route::delete('/promotions/{id}', [App\Http\Controllers\Api\PromotionController::class, 'adminDestroy']);
    Route::get('/reports/promotions', [App\Http\Controllers\Api\PromotionController::class, 'adminReport']);
});

// ─── Loyalty ─────────────────────────────────────────────────────────────────

Route::middleware('auth:sanctum')->prefix('loyalty')->group(function () {
    Route::get('/me', [App\Http\Controllers\Api\LoyaltyController::class, 'me']);
    Route::post('/hold-preview', [App\Http\Controllers\Api\LoyaltyController::class, 'holdPreview']);
    Route::post('/hold', [App\Http\Controllers\Api\LoyaltyController::class, 'hold']);
    Route::delete('/hold/{orderId}', [App\Http\Controllers\Api\LoyaltyController::class, 'releaseHold']);
});

Route::middleware(['auth:sanctum', 'permission:loyalty.manage'])->prefix('admin')->group(function () {
    Route::get('/loyalty/accounts', [App\Http\Controllers\Api\LoyaltyController::class, 'adminAccountIndex']);
    Route::get('/loyalty/accounts/{customerId}/ledger', [App\Http\Controllers\Api\LoyaltyController::class, 'adminLedger']);
    Route::post('/loyalty/accounts/{customerId}/adjust', [App\Http\Controllers\Api\LoyaltyController::class, 'adminAdjust']);
    Route::get('/reports/loyalty', [App\Http\Controllers\Api\LoyaltyController::class, 'adminReport']);
});

// ─── Delivery Orders ─────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
    Route::post('/orders/delivery', [App\Http\Controllers\Api\DeliveryOrderController::class, 'store']);
    Route::patch('/orders/{order}/delivery', [App\Http\Controllers\Api\DeliveryOrderController::class, 'update']);
});

// ─── Delivery Drivers (staff only) ───────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token', 'permission:orders.manage'])->group(function () {
    Route::get('/delivery/drivers', [App\Http\Controllers\Api\DeliveryDriverController::class, 'index']);
    Route::post('/delivery/drivers', [App\Http\Controllers\Api\DeliveryDriverController::class, 'store']);
    Route::patch('/delivery/drivers/{driver}', [App\Http\Controllers\Api\DeliveryDriverController::class, 'update']);
    Route::delete('/delivery/drivers/{driver}', [App\Http\Controllers\Api\DeliveryDriverController::class, 'destroy']);
    Route::post('/delivery/orders/{order}/assign-driver', [App\Http\Controllers\Api\DeliveryDriverController::class, 'assignDriver']);
});

// ─── Partial Online Payment ───────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/payments/online/initiate-partial', [App\Http\Controllers\Api\PaymentController::class, 'initiatePartial']);
});

// ─── SSE Real-Time Streams ───────────────────────────────────────────────────
// staff-only streams (POS / KDS) — require staff token to prevent customer eavesdropping
Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
    Route::get('/stream/orders', [App\Http\Controllers\Api\StreamController::class, 'orders']);
    Route::get('/stream/kds', [App\Http\Controllers\Api\StreamController::class, 'kds']);
    Route::get('/stream/orders/{order}/status', [App\Http\Controllers\Api\StreamController::class, 'orderStatus']);
});

// Issue a short-lived stream ticket (requires customer auth)
Route::middleware(['auth:sanctum', 'customer.token'])->post(
    '/orders/{orderId}/stream-ticket',
    [App\Http\Controllers\Api\StreamController::class, 'issueStreamTicket']
);

// Public order-status stream — uses short-lived ?ticket= (NOT the real auth token)
Route::get('/stream/order-status/{orderId}', [App\Http\Controllers\Api\StreamController::class, 'publicOrderStatus'])
    ->middleware('throttle:30,1');

// ─── SMS Campaigns + Logs (Admin) ────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:integrations.sms'])->prefix('admin/sms')->group(function () {
    // Full SMS audit log (OTP + promo + campaign + transactional)
    Route::get('/logs', [App\Http\Controllers\Api\SmsCampaignController::class, 'logs']);
    Route::get('/logs/stats', [App\Http\Controllers\Api\SmsCampaignController::class, 'logStats']);

    // Bulk SMS campaigns
    Route::get('/campaigns', [App\Http\Controllers\Api\SmsCampaignController::class, 'index']);
    Route::post('/campaigns', [App\Http\Controllers\Api\SmsCampaignController::class, 'store']);
    Route::post('/campaigns/preview', [App\Http\Controllers\Api\SmsCampaignController::class, 'preview']);
    Route::get('/campaigns/{campaign}', [App\Http\Controllers\Api\SmsCampaignController::class, 'show']);
    Route::post('/campaigns/{campaign}/send', [App\Http\Controllers\Api\SmsCampaignController::class, 'send']);
    Route::post('/campaigns/{campaign}/cancel', [App\Http\Controllers\Api\SmsCampaignController::class, 'cancel']);
});

// ─── Image Upload (Admin) ──────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:menu.manage'])->post('/admin/upload-image', [App\Http\Controllers\Api\ImageUploadController::class, 'store']);

// ─── Staff Management — per-action permissions ──────────────────────────────
Route::prefix('admin/staff')->middleware('auth:sanctum')->group(function () {
    Route::get('/',          [App\Http\Controllers\Api\StaffController::class, 'index'])->middleware('permission:staff.view');
    Route::post('/',         [App\Http\Controllers\Api\StaffController::class, 'store'])->middleware('permission:staff.create');
    Route::patch('/{id}',    [App\Http\Controllers\Api\StaffController::class, 'update'])->middleware('permission:staff.update');
    Route::post('/{id}/pin', [App\Http\Controllers\Api\StaffController::class, 'resetPin'])->middleware('permission:staff.update');
    Route::delete('/{id}',   [App\Http\Controllers\Api\StaffController::class, 'destroy'])->middleware('permission:staff.delete');
});

// ─── Analytics ────────────────────────────────────────────────────────────────

Route::middleware(['auth:sanctum', 'permission:customers.analytics'])->prefix('admin/analytics')->group(function () {
    Route::get('/peak-hours',    [App\Http\Controllers\Api\AnalyticsController::class, 'peakHours']);
    Route::get('/retention',     [App\Http\Controllers\Api\AnalyticsController::class, 'retention']);
    Route::get('/profitability', [App\Http\Controllers\Api\AnalyticsController::class, 'profitability']);
    Route::get('/forecast',      [App\Http\Controllers\Api\AnalyticsController::class, 'forecast']);
    Route::get('/customer-ltv',  [App\Http\Controllers\Api\AnalyticsController::class, 'customerLtv']);
});

// ─── Marketing: Referrals & Gift Cards ───────────────────────────────────────

// Public: validate referral code
Route::post('/referrals/validate', [App\Http\Controllers\Api\ReferralController::class, 'validate'])
    ->middleware('throttle:20,1');

// Public: gift card balance check
Route::get('/gift-cards/{code}/balance', [App\Http\Controllers\Api\GiftCardController::class, 'balance'])
    ->middleware('throttle:20,1');

// Customer: referral management
Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
    Route::get('/customer/referral-code', [App\Http\Controllers\Api\ReferralController::class, 'myCode']);
});

// Admin: gift cards and referral overview
Route::middleware(['auth:sanctum', 'permission:promotions.manage'])->group(function () {
    Route::get('/admin/gift-cards',  [App\Http\Controllers\Api\GiftCardController::class, 'index']);
    Route::post('/admin/gift-cards', [App\Http\Controllers\Api\GiftCardController::class, 'issue']);
    Route::get('/admin/referrals',   [App\Http\Controllers\Api\ReferralController::class, 'adminIndex']);
});

// ─── Tips, Scheduling, Waste, Wait Time ──────────────────────────────────────

// Public wait time estimate
Route::get('/wait-time', [App\Http\Controllers\Api\WaitTimeController::class, 'estimate']);

// Staff Scheduling (admin)
Route::middleware(['auth:sanctum', 'permission:staff.schedule'])->prefix('admin/schedules')->group(function () {
    Route::get('/',        [App\Http\Controllers\Api\ScheduleController::class, 'index']);
    Route::post('/',       [App\Http\Controllers\Api\ScheduleController::class, 'store']);
    Route::patch('/{id}',  [App\Http\Controllers\Api\ScheduleController::class, 'update']);
    Route::delete('/{id}', [App\Http\Controllers\Api\ScheduleController::class, 'destroy']);
});

// Waste Logs (staff)
Route::middleware(['auth:sanctum', 'staff.token'])->prefix('waste-logs')->group(function () {
    Route::get('/',  [App\Http\Controllers\Api\WasteLogController::class, 'index']);
    Route::post('/', [App\Http\Controllers\Api\WasteLogController::class, 'store']);
});

// ─── Item Photo Gallery ───────────────────────────────────────────────────────

// Public: list photos for an item
Route::get('/items/{itemId}/photos', [App\Http\Controllers\Api\ItemPhotoController::class, 'index']);

// Admin: manage photos
Route::middleware(['auth:sanctum', 'permission:menu.manage'])->group(function () {
    Route::post('/items/{itemId}/photos',            [App\Http\Controllers\Api\ItemPhotoController::class, 'store']);
    Route::patch('/items/{itemId}/photos/{photoId}', [App\Http\Controllers\Api\ItemPhotoController::class, 'update']);
    Route::delete('/items/{itemId}/photos/{photoId}',[App\Http\Controllers\Api\ItemPhotoController::class, 'destroy']);
});

// ─── Daily Specials ───────────────────────────────────────────────────────────

// Public: currently active specials
Route::get('/specials', [App\Http\Controllers\Api\DailySpecialController::class, 'active']);

// Admin: CRUD
Route::middleware(['auth:sanctum', 'permission:menu.manage'])->prefix('admin/specials')->group(function () {
    Route::get('/',        [App\Http\Controllers\Api\DailySpecialController::class, 'index']);
    Route::post('/',       [App\Http\Controllers\Api\DailySpecialController::class, 'store']);
    Route::patch('/{id}',  [App\Http\Controllers\Api\DailySpecialController::class, 'update']);
    Route::delete('/{id}', [App\Http\Controllers\Api\DailySpecialController::class, 'destroy']);
});

// ─── Push Notification Subscriptions ─────────────────────────────────────────

// Public: VAPID public key for subscription setup (no auth needed)
Route::get('/push/vapid-key', [App\Http\Controllers\Api\PushSubscriptionController::class, 'vapidKey']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/push/subscribe',   [App\Http\Controllers\Api\PushSubscriptionController::class, 'subscribe'])
        ->middleware('throttle:5,1');
    Route::post('/push/unsubscribe', [App\Http\Controllers\Api\PushSubscriptionController::class, 'unsubscribe'])
        ->middleware('throttle:5,1');
});

// ─── Favorites & Quick Reorder ───────────────────────────────────────────────

Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
    Route::get('/customer/favorites',               [App\Http\Controllers\Api\FavoritesController::class, 'index']);
    Route::post('/customer/favorites/{itemId}/toggle', [App\Http\Controllers\Api\FavoritesController::class, 'toggle']);
    Route::get('/customer/orders/{orderId}/reorder', [App\Http\Controllers\Api\FavoritesController::class, 'reorder']);
});

// ─── Pre-Orders (Event / Catering orders) ────────────────────────────────────

Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
    Route::get('/customer/pre-orders',  [App\Http\Controllers\Api\PreOrderApiController::class, 'index']);
    Route::post('/customer/pre-orders', [App\Http\Controllers\Api\PreOrderApiController::class, 'store']);
});

// ─── Reviews ─────────────────────────────────────────────────────────────────

// Public: item reviews
Route::get('/items/{itemId}/reviews', [App\Http\Controllers\Api\ReviewController::class, 'itemReviews']);

// Customer: submit + list own reviews
Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
    Route::post('/reviews',            [App\Http\Controllers\Api\ReviewController::class, 'store']);
    Route::get('/customer/reviews',    [App\Http\Controllers\Api\ReviewController::class, 'myReviews']);
});

// Admin: moderate reviews
Route::middleware(['auth:sanctum', 'permission:customers.manage'])->prefix('admin/reviews')->group(function () {
    Route::get('/',           [App\Http\Controllers\Api\ReviewController::class, 'adminIndex']);
    Route::patch('/{id}/moderate', [App\Http\Controllers\Api\ReviewController::class, 'moderate']);
});

// ─── Reservations ────────────────────────────────────────────────────────────
// Public: check slot availability
Route::get('/reservations/availability', [ReservationController::class, 'availability'])
    ->middleware('throttle:60,1');

// Public/customer: create & cancel reservations
Route::post('/reservations', [ReservationController::class, 'store'])
    ->middleware('throttle:10,10');

// Authenticated: list and cancel own reservations
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/reservations', [ReservationController::class, 'index']);
    Route::delete('/reservations/{id}', [ReservationController::class, 'destroy']);
});

// Staff: manage reservation status + settings
Route::middleware(['auth:sanctum', 'permission:reservations.manage'])->prefix('admin/reservations')->group(function () {
    Route::get('/',                  [ReservationController::class, 'index']);
    Route::patch('/{id}/status',     [ReservationController::class, 'updateStatus']);
    Route::get('/settings',          [ReservationController::class, 'getSettings']);
    Route::patch('/settings',        [ReservationController::class, 'updateSettings']);
});

// ─── Time Clock ────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
    Route::get('/time-clock/status',  [App\Http\Controllers\Api\TimeClockController::class, 'status']);
    Route::post('/time-clock/in',     [App\Http\Controllers\Api\TimeClockController::class, 'clockIn']);
    Route::post('/time-clock/out',    [App\Http\Controllers\Api\TimeClockController::class, 'clockOut']);
    Route::get('/time-clock/history', [App\Http\Controllers\Api\TimeClockController::class, 'history']);
    Route::get('/time-clock/summary', [App\Http\Controllers\Api\TimeClockController::class, 'summary']);
});

// ─── Barcode Label Data ──────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/items/{id}/barcode-label', [App\Http\Controllers\Api\ItemController::class, 'barcodeLabel']);
});

// ─── Customer Display (public — no auth) ────────────────────────────────────
Route::get('/display/{orderNumber}', [App\Http\Controllers\Api\CustomerDisplayController::class, 'show'])
    ->middleware('throttle:60,1');

// ─── Offline POS Sync ────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token', 'device.active'])->group(function () {
    Route::post('/offline/sync', [App\Http\Controllers\Api\OfflineSyncController::class, 'sync']);
});

// ─── Stripe Payment Gateway ─────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/stripe/intent', [App\Http\Controllers\Api\StripeController::class, 'createIntent']);
});
// Stripe webhook — public, no auth, uses raw body
Route::post('/stripe/webhook', [App\Http\Controllers\Api\StripeController::class, 'webhook'])
    ->middleware('throttle:100,1');

// ─── Xero OAuth ─────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:integrations.xero'])->group(function () {
    Route::get('/xero/connect',      [App\Http\Controllers\Api\XeroController::class, 'connect']);
    Route::get('/xero/callback',     [App\Http\Controllers\Api\XeroController::class, 'callback']);
    Route::get('/xero/status',       [App\Http\Controllers\Api\XeroController::class, 'status']);
    Route::post('/xero/disconnect',  [App\Http\Controllers\Api\XeroController::class, 'disconnect']);
    Route::post('/xero/invoices/{id}/push', [App\Http\Controllers\Api\XeroController::class, 'pushInvoice']);
    Route::post('/xero/expenses/{id}/push', [App\Http\Controllers\Api\XeroController::class, 'pushExpense']);
    Route::get('/xero/logs',         [App\Http\Controllers\Api\XeroController::class, 'logs']);
});

// ─── Webhook Subscriptions (admin-only) ────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:integrations.webhooks'])->group(function () {
    Route::get('/webhooks/events', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'supportedEvents']);
    Route::get('/webhooks', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'index']);
    Route::post('/webhooks', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'store']);
    Route::get('/webhooks/{id}', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'show']);
    Route::put('/webhooks/{id}', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'update']);
    Route::delete('/webhooks/{id}', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'destroy']);
    Route::post('/webhooks/{id}/rotate-secret', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'rotateSecret']);
    Route::get('/webhooks/{id}/logs', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'logs']);
});

// ─── Site Settings ──────────────────────────────────────────────────────────
Route::get('/site-settings/public', [App\Http\Controllers\Api\SiteSettingsController::class, 'public']);
Route::middleware(['auth:sanctum', 'permission:website.manage'])->group(function () {
    Route::get('/site-settings',          [App\Http\Controllers\Api\SiteSettingsController::class, 'index']);
    Route::put('/site-settings',          [App\Http\Controllers\Api\SiteSettingsController::class, 'update']);
    Route::post('/site-settings/upload',  [App\Http\Controllers\Api\SiteSettingsController::class, 'upload']);
});

// ─── Permissions Management (Owner only) ───────────────────────────────────
Route::middleware(['auth:sanctum', 'role:owner'])->group(function () {
    Route::get('/permissions', [App\Http\Controllers\Api\PermissionController::class, 'index']);
    Route::get('/users/{user}/permissions', [App\Http\Controllers\Api\PermissionController::class, 'show']);
    Route::put('/users/{user}/permissions', [App\Http\Controllers\Api\PermissionController::class, 'update']);
});

// ─── System Health ─────────────────────────────────────────────────────────
Route::get('/system/health', function () {
    return response()->json(['status' => 'ok']);
});

// Protected admin health — returns full details for internal monitoring
Route::middleware(['auth:sanctum', 'permission:website.manage'])->get('/admin/system/health', function () {
    return response()->json([
        'status'      => 'ok',
        'environment' => config('app.env'),
        'database'    => 'connected',
        'timestamp'   => now()->toIso8601String(),
    ]);
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
    Route::get('/driver/stats', [App\Http\Controllers\Api\DriverDeliveryController::class, 'stats']);

    // Location (push from driver app)
    Route::post('/driver/location', [App\Http\Controllers\Api\DriverLocationController::class, 'store']);
});

// ─── Driver Location for customers / staff ──────────────────────────────────
// Throttled; accessible with customer token, staff token, or driver token
Route::middleware(['auth:sanctum'])->group(function (): void {
    Route::get('/driver/deliveries/{order}/location', [App\Http\Controllers\Api\DriverLocationController::class, 'forOrder'])
        ->middleware('throttle:60,1');
});
