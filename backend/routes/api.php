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

// Opening hours status (public - for online order app)
Route::get('/opening-hours/status', function () {
    $service = app(App\Services\OpeningHoursService::class);
    $open = $service->isOpenNow();
    $message = null;
    if (!$open) {
        $message = $service->getClosureReason()
            ?? config('opening_hours.closed_message', 'We are currently closed. Please check our opening hours.');
    }

    return response()->json(['open' => $open, 'message' => $message]);
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
*/
Route::prefix('auth/customer')->group(function () {
    Route::post('/otp/request', [CustomerAuthController::class, 'requestOtp'])
        ->middleware('throttle:5,10');
    Route::post('/otp/verify', [CustomerAuthController::class, 'verifyOtp'])
        ->middleware('throttle:10,10');
});

/*
|--------------------------------------------------------------------------
| Protected Staff Routes
|--------------------------------------------------------------------------
| Staff ability checked in controllers
*/
Route::middleware('auth:sanctum')->group(function () {
    // Logout (for both staff and customers)
    Route::post('/auth/logout', [StaffAuthController::class, 'logout']);

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
    Route::post('/orders/{id}/hold', [OrderController::class, 'hold']);
    Route::post('/orders/{id}/resume', [OrderController::class, 'resume']);
    Route::post('/orders/{id}/payments', [OrderController::class, 'addPayments']);

    // KDS
    Route::get('/kds/orders', [KdsController::class, 'index']);
    Route::post('/kds/orders/{id}/start', [KdsController::class, 'start']);
    Route::post('/kds/orders/{id}/bump', [KdsController::class, 'bump']);
    Route::post('/kds/orders/{id}/recall', [KdsController::class, 'recall']);

    // Print jobs
    Route::get('/print-jobs', [PrintJobController::class, 'index']);
    Route::post('/print-jobs/{id}/retry', [PrintJobController::class, 'retry']);

    // Inventory
    Route::get('/inventory', [InventoryController::class, 'index']);
    Route::post('/inventory', [InventoryController::class, 'store']);
    Route::get('/inventory/{id}', [InventoryController::class, 'show']);
    Route::patch('/inventory/{id}', [InventoryController::class, 'update']);
    Route::post('/inventory/{id}/adjust', [InventoryController::class, 'adjust']);
    Route::post('/inventory/stock-count', [InventoryController::class, 'stockCount']);
    Route::get('/inventory/low-stock', [InventoryController::class, 'lowStock']);
    Route::get('/inventory/{id}/price-history', [InventoryController::class, 'priceHistory']);
    Route::get('/inventory/{id}/cheapest-supplier', [InventoryController::class, 'cheapestSupplier']);

    // Suppliers
    Route::get('/suppliers', [SupplierController::class, 'index']);
    Route::post('/suppliers', [SupplierController::class, 'store']);
    Route::get('/suppliers/{id}', [SupplierController::class, 'show']);
    Route::patch('/suppliers/{id}', [SupplierController::class, 'update']);
    Route::delete('/suppliers/{id}', [SupplierController::class, 'destroy']);

    // Purchases
    Route::get('/purchases', [PurchaseController::class, 'index']);
    Route::post('/purchases', [PurchaseController::class, 'store']);
    Route::get('/purchases/{id}', [PurchaseController::class, 'show']);
    Route::patch('/purchases/{id}', [PurchaseController::class, 'update']);
    Route::post('/purchases/{id}/receipts', [PurchaseController::class, 'uploadReceipt']);
    Route::post('/purchases/import', [PurchaseController::class, 'import']);

    // Shifts + cash drawer
    Route::get('/shifts/current', [ShiftController::class, 'current']);
    Route::post('/shifts/open', [ShiftController::class, 'open']);
    Route::post('/shifts/{id}/close', [ShiftController::class, 'close']);
    Route::post('/shifts/{id}/cash-movements', [CashMovementController::class, 'store']);

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
    Route::post('/orders/{orderId}/refunds', [RefundController::class, 'store']);

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
Route::middleware('auth:sanctum')->prefix('customer')->group(function () {
    Route::get('/me', [CustomerController::class, 'me']);
    Route::get('/orders', [CustomerController::class, 'orders']);
    Route::get('/orders/{id}', [CustomerController::class, 'show']);
    Route::post('/orders', [OrderController::class, 'storeCustomer']);
    Route::patch('/profile', [CustomerController::class, 'update']);
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

// Customer SMS opt-out
Route::post('/customer/sms/opt-out', [CustomerController::class, 'optOut']);

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
Route::post('/items/stock-check', function (Request $request) {
    $itemIds = $request->input('item_ids', []);
    $items = App\Models\Item::whereIn('id', $itemIds)
        ->select('id', 'name', 'stock_quantity', 'track_stock', 'availability_type', 'low_stock_threshold')
        ->get();

    return response()->json(['items' => $items]);
});

// Protected menu management (staff only)
Route::middleware('auth:sanctum')->group(function () {
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

// Webhook — no auth, signature verified by VerifyBmlSignature middleware
Route::post('/payments/bml/webhook', [BmlWebhookController::class, 'handle'])
    ->middleware('bml.signature')
    ->withoutMiddleware([Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class]);

// Initiate BML payment (customer only)
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/orders/{orderId}/pay/bml', [PaymentController::class, 'initiateOnline']);
});

// ─── Promotions ──────────────────────────────────────────────────────────────

// Public/customer — validate a code
Route::post('/promotions/validate', [App\Http\Controllers\Api\PromotionController::class, 'validate'])
    ->middleware('throttle:30,1');

// Authenticated customer/staff — apply/remove promo
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/orders/{orderId}/apply-promo', [App\Http\Controllers\Api\PromotionController::class, 'applyToOrder']);
    Route::delete('/orders/{orderId}/promo/{promotionId}', [App\Http\Controllers\Api\PromotionController::class, 'removeFromOrder']);
});

// Admin — full CRUD (requires staff token + manager/admin/owner role)
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('admin')->group(function () {
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

Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('admin')->group(function () {
    Route::get('/loyalty/accounts', [App\Http\Controllers\Api\LoyaltyController::class, 'adminAccountIndex']);
    Route::get('/loyalty/accounts/{customerId}/ledger', [App\Http\Controllers\Api\LoyaltyController::class, 'adminLedger']);
    Route::post('/loyalty/accounts/{customerId}/adjust', [App\Http\Controllers\Api\LoyaltyController::class, 'adminAdjust']);
    Route::get('/reports/loyalty', [App\Http\Controllers\Api\LoyaltyController::class, 'adminReport']);
});

// ─── Delivery Orders ─────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/orders/delivery', [App\Http\Controllers\Api\DeliveryOrderController::class, 'store']);
    Route::patch('/orders/{order}/delivery', [App\Http\Controllers\Api\DeliveryOrderController::class, 'update']);
});

// ─── Partial Online Payment ───────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/payments/online/initiate-partial', [App\Http\Controllers\Api\PaymentController::class, 'initiatePartial']);
});

// ─── SSE Real-Time Streams ───────────────────────────────────────────────────
// staff-only streams (POS / KDS)
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/stream/orders', [App\Http\Controllers\Api\StreamController::class, 'orders']);
    Route::get('/stream/kds', [App\Http\Controllers\Api\StreamController::class, 'kds']);
    Route::get('/stream/orders/{order}/status', [App\Http\Controllers\Api\StreamController::class, 'orderStatus']);
});

// Issue a short-lived stream ticket (requires customer auth)
Route::middleware('auth:sanctum')->post(
    '/orders/{orderId}/stream-ticket',
    [App\Http\Controllers\Api\StreamController::class, 'issueStreamTicket']
);

// Public order-status stream — uses short-lived ?ticket= (NOT the real auth token)
Route::get('/stream/order-status/{orderId}', [App\Http\Controllers\Api\StreamController::class, 'publicOrderStatus'])
    ->middleware('throttle:30,1');

// ─── SMS Campaigns + Logs (Admin) ────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('admin/sms')->group(function () {
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
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->post('/admin/upload-image', [App\Http\Controllers\Api\ImageUploadController::class, 'store']);

// ─── Staff Management (Admin/Owner only) ──────────────────────────────────
Route::middleware(['auth:sanctum', 'role:admin,owner'])->prefix('admin/staff')->group(function () {
    Route::get('/',         [App\Http\Controllers\Api\StaffController::class, 'index']);
    Route::post('/',        [App\Http\Controllers\Api\StaffController::class, 'store']);
    Route::patch('/{id}',   [App\Http\Controllers\Api\StaffController::class, 'update']);
    Route::post('/{id}/pin', [App\Http\Controllers\Api\StaffController::class, 'resetPin']);
    Route::delete('/{id}',  [App\Http\Controllers\Api\StaffController::class, 'destroy']);
});

// ─── Analytics ────────────────────────────────────────────────────────────────

Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('admin/analytics')->group(function () {
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
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/customer/referral-code', [App\Http\Controllers\Api\ReferralController::class, 'myCode']);
});

// Admin: gift cards and referral overview
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->group(function () {
    Route::get('/admin/gift-cards',  [App\Http\Controllers\Api\GiftCardController::class, 'index']);
    Route::post('/admin/gift-cards', [App\Http\Controllers\Api\GiftCardController::class, 'issue']);
    Route::get('/admin/referrals',   [App\Http\Controllers\Api\ReferralController::class, 'adminIndex']);
});

// ─── Tips, Scheduling, Waste, Wait Time ──────────────────────────────────────

// Public wait time estimate
Route::get('/wait-time', [App\Http\Controllers\Api\WaitTimeController::class, 'estimate']);

// Staff Scheduling (admin)
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('admin/schedules')->group(function () {
    Route::get('/',        [App\Http\Controllers\Api\ScheduleController::class, 'index']);
    Route::post('/',       [App\Http\Controllers\Api\ScheduleController::class, 'store']);
    Route::patch('/{id}',  [App\Http\Controllers\Api\ScheduleController::class, 'update']);
    Route::delete('/{id}', [App\Http\Controllers\Api\ScheduleController::class, 'destroy']);
});

// Waste Logs (staff)
Route::middleware(['auth:sanctum'])->prefix('waste-logs')->group(function () {
    Route::get('/',  [App\Http\Controllers\Api\WasteLogController::class, 'index']);
    Route::post('/', [App\Http\Controllers\Api\WasteLogController::class, 'store']);
});

// ─── Item Photo Gallery ───────────────────────────────────────────────────────

// Public: list photos for an item
Route::get('/items/{itemId}/photos', [App\Http\Controllers\Api\ItemPhotoController::class, 'index']);

// Admin: manage photos
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->group(function () {
    Route::post('/items/{itemId}/photos',            [App\Http\Controllers\Api\ItemPhotoController::class, 'store']);
    Route::patch('/items/{itemId}/photos/{photoId}', [App\Http\Controllers\Api\ItemPhotoController::class, 'update']);
    Route::delete('/items/{itemId}/photos/{photoId}',[App\Http\Controllers\Api\ItemPhotoController::class, 'destroy']);
});

// ─── Daily Specials ───────────────────────────────────────────────────────────

// Public: currently active specials
Route::get('/specials', [App\Http\Controllers\Api\DailySpecialController::class, 'active']);

// Admin: CRUD
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('admin/specials')->group(function () {
    Route::get('/',        [App\Http\Controllers\Api\DailySpecialController::class, 'index']);
    Route::post('/',       [App\Http\Controllers\Api\DailySpecialController::class, 'store']);
    Route::patch('/{id}',  [App\Http\Controllers\Api\DailySpecialController::class, 'update']);
    Route::delete('/{id}', [App\Http\Controllers\Api\DailySpecialController::class, 'destroy']);
});

// ─── Push Notification Subscriptions ─────────────────────────────────────────

Route::post('/push/subscribe',   [App\Http\Controllers\Api\PushSubscriptionController::class, 'subscribe'])
    ->middleware('throttle:20,1');
Route::post('/push/unsubscribe', [App\Http\Controllers\Api\PushSubscriptionController::class, 'unsubscribe'])
    ->middleware('throttle:20,1');

// ─── Favorites & Quick Reorder ───────────────────────────────────────────────

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/customer/favorites',               [App\Http\Controllers\Api\FavoritesController::class, 'index']);
    Route::post('/customer/favorites/{itemId}/toggle', [App\Http\Controllers\Api\FavoritesController::class, 'toggle']);
    Route::get('/customer/orders/{orderId}/reorder', [App\Http\Controllers\Api\FavoritesController::class, 'reorder']);
});

// ─── Reviews ─────────────────────────────────────────────────────────────────

// Public: item reviews
Route::get('/items/{itemId}/reviews', [App\Http\Controllers\Api\ReviewController::class, 'itemReviews']);

// Customer: submit + list own reviews
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/reviews',            [App\Http\Controllers\Api\ReviewController::class, 'store']);
    Route::get('/customer/reviews',    [App\Http\Controllers\Api\ReviewController::class, 'myReviews']);
});

// Admin: moderate reviews
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('admin/reviews')->group(function () {
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
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('admin/reservations')->group(function () {
    Route::get('/',                  [ReservationController::class, 'index']);
    Route::patch('/{id}/status',     [ReservationController::class, 'updateStatus']);
    Route::get('/settings',          [ReservationController::class, 'getSettings']);
    Route::patch('/settings',        [ReservationController::class, 'updateSettings']);
});

// ─── Invoices ──────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('invoices')->group(function () {
    Route::get('/',                           [App\Http\Controllers\Api\InvoiceController::class, 'index']);
    Route::post('/',                          [App\Http\Controllers\Api\InvoiceController::class, 'store']);
    Route::get('/{id}',                       [App\Http\Controllers\Api\InvoiceController::class, 'show']);
    Route::patch('/{id}',                     [App\Http\Controllers\Api\InvoiceController::class, 'update']);
    Route::post('/{id}/mark-sent',            [App\Http\Controllers\Api\InvoiceController::class, 'markSent']);
    Route::post('/{id}/mark-paid',            [App\Http\Controllers\Api\InvoiceController::class, 'markPaid']);
    Route::post('/{id}/void',                 [App\Http\Controllers\Api\InvoiceController::class, 'voidInvoice']);
    Route::post('/{id}/credit-note',          [App\Http\Controllers\Api\InvoiceController::class, 'createCreditNote']);
    Route::get('/{id}/pdf',                   [App\Http\Controllers\Api\InvoiceController::class, 'generatePdf']);
    Route::post('/from-order/{orderId}',      [App\Http\Controllers\Api\InvoiceController::class, 'createFromOrder']);
    Route::post('/from-purchase/{purchaseId}',[App\Http\Controllers\Api\InvoiceController::class, 'createFromPurchase']);
});

// ─── Expenses ──────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('expenses')->group(function () {
    Route::get('/',                [App\Http\Controllers\Api\ExpenseController::class, 'index']);
    Route::post('/',               [App\Http\Controllers\Api\ExpenseController::class, 'store']);
    Route::get('/categories',      [App\Http\Controllers\Api\ExpenseController::class, 'categories']);
    Route::get('/summary',         [App\Http\Controllers\Api\ExpenseController::class, 'summary']);
    Route::get('/{id}',            [App\Http\Controllers\Api\ExpenseController::class, 'show']);
    Route::patch('/{id}',          [App\Http\Controllers\Api\ExpenseController::class, 'update']);
    Route::delete('/{id}',         [App\Http\Controllers\Api\ExpenseController::class, 'destroy']);
    Route::post('/{id}/receipt',   [App\Http\Controllers\Api\ExpenseController::class, 'uploadReceipt']);
    Route::post('/{id}/approve',   [App\Http\Controllers\Api\ExpenseController::class, 'approve']);
});

// ─── Finance Reports ───────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('reports/finance')->group(function () {
    Route::get('/profit-and-loss',    [App\Http\Controllers\Api\FinanceReportController::class, 'profitAndLoss']);
    Route::get('/cash-flow',          [App\Http\Controllers\Api\FinanceReportController::class, 'cashFlow']);
    Route::get('/tax',                [App\Http\Controllers\Api\FinanceReportController::class, 'taxReport']);
    Route::get('/daily-summary',      [App\Http\Controllers\Api\FinanceReportController::class, 'dailySummary']);
    Route::get('/accounts-payable',   [App\Http\Controllers\Api\FinanceReportController::class, 'accountsPayable']);
    Route::get('/accounts-receivable',[App\Http\Controllers\Api\FinanceReportController::class, 'accountsReceivable']);
});

// ─── Supplier Intelligence ─────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('suppliers')->group(function () {
    Route::post('/{id}/ratings',            [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'rate']);
    Route::get('/{id}/ratings',             [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'ratings']);
    Route::get('/{id}/performance',         [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'performance']);
    Route::post('/{id}/performance/refresh',[App\Http\Controllers\Api\SupplierIntelligenceController::class, 'refreshCache']);
    Route::get('/performance',              [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'allPerformance']);
    Route::get('/price-comparison/{itemId}',[App\Http\Controllers\Api\SupplierIntelligenceController::class, 'priceComparison']);
    Route::get('/{id}/price-history/{itemId}', [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'priceHistory']);
});

// ─── Purchase Workflow ─────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('purchases')->group(function () {
    Route::post('/{id}/approve',         [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'approve']);
    Route::post('/{id}/reject',          [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'reject']);
    Route::post('/{id}/receive',         [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'receive']);
    Route::get('/suggest',               [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'autoSuggest']);
    Route::post('/from-suggest',         [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'createFromSuggest']);
});

// ─── Inventory Categories & Unit Conversions ───────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('inventory-categories')->group(function () {
    Route::get('/',        fn() => response()->json(['categories' => \App\Models\InventoryCategory::orderBy('name')->get()]));
    Route::post('/',       function (Illuminate\Http\Request $req) {
        $validated = $req->validate(['name' => 'required|string|max:100', 'description' => 'nullable|string']);
        $cat = \App\Models\InventoryCategory::create([...$validated, 'slug' => \Illuminate\Support\Str::slug($validated['name'])]);
        return response()->json(['category' => $cat], 201);
    });
    Route::patch('/{id}',  function (Illuminate\Http\Request $req, int $id) {
        $cat = \App\Models\InventoryCategory::findOrFail($id);
        $cat->update($req->validate(['name' => 'sometimes|string|max:100', 'description' => 'nullable|string', 'is_active' => 'sometimes|boolean']));
        return response()->json(['category' => $cat]);
    });
});

Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('unit-conversions')->group(function () {
    Route::get('/', fn() => response()->json(['conversions' => \App\Models\UnitConversion::all()]));
    Route::post('/', function (Illuminate\Http\Request $req) {
        $v = $req->validate(['from_unit' => 'required|string|max:20', 'to_unit' => 'required|string|max:20', 'factor' => 'required|numeric|min:0.000001']);
        $uc = \App\Models\UnitConversion::updateOrCreate(['from_unit' => $v['from_unit'], 'to_unit' => $v['to_unit']], ['factor' => $v['factor']]);
        return response()->json(['conversion' => $uc], 201);
    });
});

// ─── Forecasting ───────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,admin,owner'])->prefix('forecasts')->group(function () {
    Route::get('/revenue',   [App\Http\Controllers\Api\ForecastController::class, 'revenueForecast']);
    Route::get('/items',     [App\Http\Controllers\Api\ForecastController::class, 'itemForecast']);
    Route::get('/trends',    [App\Http\Controllers\Api\ForecastController::class, 'salesTrends']);
    Route::get('/inventory', [App\Http\Controllers\Api\ForecastController::class, 'inventoryForecast']);
});

// ─── System Health ─────────────────────────────────────────────────────────
Route::get('/system/health', function () {
    return response()->json(['status' => 'ok']);
});
