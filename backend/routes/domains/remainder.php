
/*
|--------------------------------------------------------------------------
| Receipt Token Routes (Public)
|--------------------------------------------------------------------------
*/
Route::get('/receipts/{token}', [ReceiptController::class, 'show']);
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
Route::middleware('throttle:120,1')->group(function () {
    Route::get('/categories', [CategoryController::class, 'index']);
    Route::get('/categories/{id}', [CategoryController::class, 'show']);
    Route::get('/items', [ItemController::class, 'index']);
    Route::post('/recommendations/cart', [App\Http\Controllers\Api\ItemRecommendationsController::class, 'forCart']);
    Route::get('/items/{id}', [ItemController::class, 'show']);
    Route::get('/items/barcode/{barcode}', [ItemController::class, 'lookupByBarcode']);
});

// Get stock info for multiple items
Route::post('/items/stock-check', [ItemController::class, 'bulkStockCheck'])
    ->middleware('throttle:60,1');

// Protected menu management (staff only — requires menu.manage permission)
Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->group(function () {
    Route::get('/admin/menu-groups', [App\Http\Controllers\Api\KitchenMenuAdminController::class, 'menuGroups']);
    Route::get('/admin/kitchen-menu-state', [App\Http\Controllers\Api\KitchenMenuAdminController::class, 'kitchenState']);
    Route::patch('/admin/kitchen-menu-state', [App\Http\Controllers\Api\KitchenMenuAdminController::class, 'updateKitchenState']);

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
    ->withoutMiddleware([Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class])
    ->middleware('throttle:60,1');

// Initiate BML payment (customer only)
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/orders/{orderId}/pay/bml', [PaymentController::class, 'initiateOnline']);
    Route::post('/orders/{orderId}/complete-zero-balance', [PaymentController::class, 'completeZeroBalance']);
});

// ─── Promotions ──────────────────────────────────────────────────────────────

// Public/customer — validate a code
Route::post('/promotions/validate', [App\Http\Controllers\Api\PromotionController::class, 'validate'])
    ->middleware('throttle:20,1');

// Apply/remove promo — requires auth; authorization matrix enforced in the controller:
//   - Customer token: may only modify their own order (IDOR check)
//   - Staff token: requires promotions.discounts permission (checked in controller)
//   - Unauthenticated: rejected by auth:sanctum
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/orders/{orderId}/apply-promo', [App\Http\Controllers\Api\PromotionController::class, 'applyToOrder']);
    Route::delete('/orders/{orderId}/promo/{promotionId}', [App\Http\Controllers\Api\PromotionController::class, 'removeFromOrder']);
});

// Admin — full CRUD (requires promotions.manage permission)
Route::middleware(['auth:sanctum', 'staff.token', 'permission:promotions.manage'])->prefix('admin')->group(function () {
    Route::get('/promotions', [App\Http\Controllers\Api\PromotionController::class, 'adminIndex']);
    Route::post('/promotions', [App\Http\Controllers\Api\PromotionController::class, 'adminStore']);
    Route::patch('/promotions/{id}', [App\Http\Controllers\Api\PromotionController::class, 'adminUpdate']);
    Route::delete('/promotions/{id}', [App\Http\Controllers\Api\PromotionController::class, 'adminDestroy']);
    Route::get('/reports/promotions', [App\Http\Controllers\Api\PromotionController::class, 'adminReport']);
});

// ─── Loyalty ─────────────────────────────────────────────────────────────────
//
// Customer-facing endpoints — the online ordering app calls these with a
// Sanctum customer token. The controller methods historically defended
// themselves with `$user instanceof Customer` checks at the top of each
// method (and they still do), but we pin `customer.token` at the route
// level too so a new sibling route in this group can't accidentally
// inherit weaker auth. Defense in depth: the middleware short-circuits
// before the controller even loads. Staff redemptions on behalf of a
// customer at the POS register go through the separate /api/pos/loyalty/*
// routes which are gated by staff.token + the loyalty.redeem permission.

Route::middleware(['auth:sanctum', 'customer.token'])->prefix('loyalty')->group(function () {
    Route::get('/me', [App\Http\Controllers\Api\LoyaltyController::class, 'me']);
    Route::post('/hold-preview', [App\Http\Controllers\Api\LoyaltyController::class, 'holdPreview']);
    Route::post('/hold', [App\Http\Controllers\Api\LoyaltyController::class, 'hold']);
    Route::delete('/hold/{orderId}', [App\Http\Controllers\Api\LoyaltyController::class, 'releaseHold']);
});

Route::middleware(['auth:sanctum', 'staff.token', 'permission:loyalty.manage'])->prefix('admin')->group(function () {
    Route::get('/loyalty/settings', [App\Http\Controllers\Api\LoyaltyController::class, 'adminSettings']);
    Route::put('/loyalty/settings', [App\Http\Controllers\Api\LoyaltyController::class, 'adminUpdateSettings']);
    Route::put('/loyalty/tiers', [App\Http\Controllers\Api\LoyaltyController::class, 'adminUpdateTiers']);
    Route::get('/loyalty/accounts', [App\Http\Controllers\Api\LoyaltyController::class, 'adminAccountIndex']);
    Route::get('/loyalty/accounts/{customerId}/ledger', [App\Http\Controllers\Api\LoyaltyController::class, 'adminLedger']);
    Route::post('/loyalty/accounts/{customerId}/adjust', [App\Http\Controllers\Api\LoyaltyController::class, 'adminAdjust']);
    Route::get('/reports/loyalty', [App\Http\Controllers\Api\LoyaltyController::class, 'adminReport']);
});

// ─── Delivery Orders ─────────────────────────────────────────────────────────
// auth:sanctum only — controller handles both customer tokens and staff tokens
Route::middleware('auth:sanctum')->group(function () {
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
    Route::post('/payments/online/initiate-partial', [PaymentController::class, 'initiatePartial']);
});

// ─── SSE Real-Time Streams ───────────────────────────────────────────────────
// staff-only streams (POS / KDS) — require staff token to prevent customer eavesdropping
Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
    Route::get('/stream/orders', [App\Http\Controllers\Api\StreamController::class, 'orders']);
    Route::get('/stream/kds', [App\Http\Controllers\Api\StreamController::class, 'kds'])
        ->middleware('permission:kds.view');
    Route::get('/stream/orders/{order}/status', [App\Http\Controllers\Api\StreamController::class, 'orderStatus']);
});

// Issue a short-lived stream ticket (requires customer auth)
Route::middleware(['auth:sanctum', 'customer.token'])->post(
    '/orders/{orderId}/stream-ticket',
    [App\Http\Controllers\Api\StreamController::class, 'issueStreamTicket'],
);

// Public order-status stream — uses short-lived ?ticket= (NOT the real auth token)
Route::get('/stream/order-status/{orderId}', [App\Http\Controllers\Api\StreamController::class, 'publicOrderStatus'])
    ->middleware('throttle:30,1');

// ─── SMS Campaigns + Logs (Admin) ────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token', 'permission:integrations.sms'])->prefix('admin/sms')->group(function () {
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

    // SMS Contacts & Groups
    Route::get('/contacts', [App\Http\Controllers\Api\SmsContactController::class, 'index']);
    Route::post('/contacts', [App\Http\Controllers\Api\SmsContactController::class, 'store']);
    Route::patch('/contacts/{id}', [App\Http\Controllers\Api\SmsContactController::class, 'update']);
    Route::delete('/contacts/{id}', [App\Http\Controllers\Api\SmsContactController::class, 'destroy']);

    Route::get('/contact-groups', [App\Http\Controllers\Api\SmsContactGroupController::class, 'index']);
    Route::post('/contact-groups', [App\Http\Controllers\Api\SmsContactGroupController::class, 'store']);
    Route::patch('/contact-groups/{id}', [App\Http\Controllers\Api\SmsContactGroupController::class, 'update']);
    Route::delete('/contact-groups/{id}', [App\Http\Controllers\Api\SmsContactGroupController::class, 'destroy']);
    Route::post('/contact-groups/{id}/members', [App\Http\Controllers\Api\SmsContactGroupController::class, 'addMember']);
    Route::delete('/contact-groups/{id}/members/{contactId}', [App\Http\Controllers\Api\SmsContactGroupController::class, 'removeMember']);

    // SMS Templates
    Route::get('/templates', [App\Http\Controllers\Api\SmsTemplateController::class, 'index']);
    Route::post('/templates', [App\Http\Controllers\Api\SmsTemplateController::class, 'store']);
    Route::patch('/templates/{id}', [App\Http\Controllers\Api\SmsTemplateController::class, 'update']);
    Route::delete('/templates/{id}', [App\Http\Controllers\Api\SmsTemplateController::class, 'destroy']);
    Route::post('/templates/{id}/preview', [App\Http\Controllers\Api\SmsTemplateController::class, 'preview']);

    // Scheduled Messages
    Route::get('/scheduled', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'index']);
    Route::post('/scheduled', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'store']);
    Route::patch('/scheduled/{id}', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'update']);
    Route::delete('/scheduled/{id}', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'destroy']);
    Route::post('/scheduled/{id}/pause', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'pause']);
    Route::post('/scheduled/{id}/resume', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'resume']);

    // Staff notification logs
    Route::get('/staff-logs', [App\Http\Controllers\Api\StaffNotificationLogController::class, 'index']);
    Route::post('/staff-logs/{id}/resend', [App\Http\Controllers\Api\StaffNotificationLogController::class, 'resend']);
});

// ─── Staff Notification Preferences ──────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token', 'permission:staff.update'])->group(function () {
    Route::get('/admin/staff/{userId}/notification-prefs', [App\Http\Controllers\Api\StaffNotificationPrefController::class, 'show']);
    Route::put('/admin/staff/{userId}/notification-prefs', [App\Http\Controllers\Api\StaffNotificationPrefController::class, 'update']);
});

// ─── Image Upload (Admin) ──────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->post('/admin/upload-image', [App\Http\Controllers\Api\ImageUploadController::class, 'store']);

// ─── Staff Management — per-action permissions ──────────────────────────────
Route::prefix('admin/staff')->middleware(['auth:sanctum', 'staff.token'])->group(function () {
    Route::get('/', [App\Http\Controllers\Api\StaffController::class, 'index'])->middleware('permission:staff.view');
    Route::post('/', [App\Http\Controllers\Api\StaffController::class, 'store'])->middleware('permission:staff.create');
    Route::patch('/{id}', [App\Http\Controllers\Api\StaffController::class, 'update'])->middleware('permission:staff.update');
    Route::post('/{id}/pin', [App\Http\Controllers\Api\StaffController::class, 'resetPin'])->middleware('permission:staff.update');
    Route::delete('/{id}', [App\Http\Controllers\Api\StaffController::class, 'destroy'])->middleware('permission:staff.delete');
});

// ─── Analytics ────────────────────────────────────────────────────────────────

Route::middleware(['auth:sanctum', 'staff.token', 'permission:customers.analytics'])->prefix('admin/analytics')->group(function () {
    Route::get('/peak-hours', [App\Http\Controllers\Api\AnalyticsController::class, 'peakHours']);
    Route::get('/retention', [App\Http\Controllers\Api\AnalyticsController::class, 'retention']);
    Route::get('/profitability', [App\Http\Controllers\Api\AnalyticsController::class, 'profitability']);
    Route::get('/forecast', [App\Http\Controllers\Api\AnalyticsController::class, 'forecast']);
    Route::get('/customer-ltv', [App\Http\Controllers\Api\AnalyticsController::class, 'customerLtv']);
});

// ─── Marketing: Referrals & Gift Cards ───────────────────────────────────────

// Public: validate referral code
Route::post('/referrals/validate', [App\Http\Controllers\Api\ReferralController::class, 'validate'])
    ->middleware('throttle:30,1');

// Public: gift card balance check
Route::get('/gift-cards/{code}/balance', [App\Http\Controllers\Api\GiftCardController::class, 'balance'])
    ->middleware('throttle:30,1');

// Customer: referral management + gift card on orders
Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
    Route::get('/customer/referral-code', [App\Http\Controllers\Api\ReferralController::class, 'myCode']);
    Route::post('/orders/{orderId}/apply-gift-card', [App\Http\Controllers\Api\GiftCardController::class, 'applyToOrder']);
    Route::delete('/orders/{orderId}/gift-card', [App\Http\Controllers\Api\GiftCardController::class, 'removeFromOrder']);
    Route::post('/orders/{orderId}/apply-referral', [App\Http\Controllers\Api\ReferralController::class, 'applyToOrder']);
    Route::delete('/orders/{orderId}/referral', [App\Http\Controllers\Api\ReferralController::class, 'removeFromOrder']);
});

// Admin: gift cards and referral overview
Route::middleware(['auth:sanctum', 'permission:promotions.manage'])->group(function () {
    Route::get('/admin/gift-cards', [App\Http\Controllers\Api\GiftCardController::class, 'index']);
    Route::post('/admin/gift-cards', [App\Http\Controllers\Api\GiftCardController::class, 'issue']);
    Route::get('/admin/referrals', [App\Http\Controllers\Api\ReferralController::class, 'adminIndex']);
    Route::get('/admin/marketing/automation', [App\Http\Controllers\Api\AdminMarketingAutomationController::class, 'show']);
    Route::patch('/admin/marketing/automation', [App\Http\Controllers\Api\AdminMarketingAutomationController::class, 'update']);
});

Route::middleware(['auth:sanctum', 'staff.token', 'permission:customers.analytics'])->group(function () {
    Route::get('/admin/marketing/item-pairs', [App\Http\Controllers\Api\ItemPairAdminController::class, 'index']);
});

// ─── Tips, Scheduling, Waste, Wait Time ──────────────────────────────────────

// Public wait time estimate
Route::get('/wait-time', [App\Http\Controllers\Api\WaitTimeController::class, 'estimate']);

// Staff Scheduling (admin)
Route::middleware(['auth:sanctum', 'staff.token', 'permission:staff.schedule'])->prefix('admin/schedules')->group(function () {
    Route::get('/', [App\Http\Controllers\Api\ScheduleController::class, 'index']);
    Route::post('/', [App\Http\Controllers\Api\ScheduleController::class, 'store']);
    Route::patch('/{id}', [App\Http\Controllers\Api\ScheduleController::class, 'update']);
    Route::delete('/{id}', [App\Http\Controllers\Api\ScheduleController::class, 'destroy']);
});

// Waste Logs (staff)
Route::middleware(['auth:sanctum', 'staff.token', 'permission:inventory.manage'])->prefix('waste-logs')->group(function () {
    Route::get('/', [App\Http\Controllers\Api\WasteLogController::class, 'index']);
    Route::get('/summary', [App\Http\Controllers\Api\WasteLogController::class, 'summary']);
    Route::post('/', [App\Http\Controllers\Api\WasteLogController::class, 'store']);
});

// ─── Item Variants ────────────────────────────────────────────────────────────

// Admin: full CRUD for variants (requires menu.manage permission)
Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->group(function () {
    Route::get('/items/{itemId}/variants', [App\Http\Controllers\Api\VariantController::class, 'index']);
    Route::post('/items/{itemId}/variants', [App\Http\Controllers\Api\VariantController::class, 'store']);
    Route::patch('/items/{itemId}/variants/{id}', [App\Http\Controllers\Api\VariantController::class, 'update']);
    Route::delete('/items/{itemId}/variants/{id}', [App\Http\Controllers\Api\VariantController::class, 'destroy']);
});

// ─── Item Photo Gallery ───────────────────────────────────────────────────────

// Public: list photos for an item
Route::get('/items/{itemId}/photos', [App\Http\Controllers\Api\ItemPhotoController::class, 'index']);

// Admin: manage photos
Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->group(function () {
    Route::post('/items/{itemId}/photos', [App\Http\Controllers\Api\ItemPhotoController::class, 'store']);
    Route::patch('/items/{itemId}/photos/{photoId}', [App\Http\Controllers\Api\ItemPhotoController::class, 'update']);
    Route::delete('/items/{itemId}/photos/{photoId}', [App\Http\Controllers\Api\ItemPhotoController::class, 'destroy']);
});

// ─── Daily Specials ───────────────────────────────────────────────────────────

// Public: currently active specials
Route::get('/specials', [App\Http\Controllers\Api\DailySpecialController::class, 'active']);

// Admin: CRUD
Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->prefix('admin/specials')->group(function () {
    Route::get('/', [App\Http\Controllers\Api\DailySpecialController::class, 'index']);
    Route::get('/{id}', [App\Http\Controllers\Api\DailySpecialController::class, 'show']);
    Route::post('/', [App\Http\Controllers\Api\DailySpecialController::class, 'store']);
    Route::patch('/{id}', [App\Http\Controllers\Api\DailySpecialController::class, 'update']);
    Route::delete('/{id}', [App\Http\Controllers\Api\DailySpecialController::class, 'destroy']);
});

// ─── Push Notification Subscriptions ─────────────────────────────────────────

// Public: VAPID public key for subscription setup (no auth needed)
Route::get('/push/vapid-key', [App\Http\Controllers\Api\PushSubscriptionController::class, 'vapidKey']);

Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
    Route::post('/push/subscribe', [App\Http\Controllers\Api\PushSubscriptionController::class, 'subscribe'])
        ->middleware('throttle:5,1');
    Route::post('/push/unsubscribe', [App\Http\Controllers\Api\PushSubscriptionController::class, 'unsubscribe'])
        ->middleware('throttle:5,1');
});

// ─── Favorites & Quick Reorder ───────────────────────────────────────────────

Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
    Route::get('/customer/favorites', [App\Http\Controllers\Api\FavoritesController::class, 'index']);
    Route::post('/customer/favorites/{itemId}/toggle', [App\Http\Controllers\Api\FavoritesController::class, 'toggle']);
    Route::get('/customer/orders/{orderId}/reorder', [App\Http\Controllers\Api\FavoritesController::class, 'reorder']);
});

// ─── Pre-Orders (Event / Catering orders) ────────────────────────────────────

Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
    Route::get('/customer/pre-orders', [App\Http\Controllers\Api\PreOrderApiController::class, 'index']);
    Route::post('/customer/pre-orders', [App\Http\Controllers\Api\PreOrderApiController::class, 'store']);
});

// ─── Reviews ─────────────────────────────────────────────────────────────────

// Public: item reviews
Route::get('/items/{itemId}/reviews', [App\Http\Controllers\Api\ReviewController::class, 'itemReviews']);
Route::get('/reviews/featured', [App\Http\Controllers\Api\ReviewController::class, 'featured'])
    ->middleware('throttle:60,1');

Route::post('/corporate-inquiries', [App\Http\Controllers\Api\CorporateInquiryController::class, 'store'])
    ->middleware('throttle:10,1');

// Customer: submit + list own reviews
Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
    Route::post('/reviews', [App\Http\Controllers\Api\ReviewController::class, 'store']);
    Route::get('/customer/reviews', [App\Http\Controllers\Api\ReviewController::class, 'myReviews']);
});

// Admin: moderate reviews
Route::middleware(['auth:sanctum', 'permission:customers.manage'])->prefix('admin/reviews')->group(function () {
    Route::get('/', [App\Http\Controllers\Api\ReviewController::class, 'adminIndex']);
    Route::patch('/{id}/moderate', [App\Http\Controllers\Api\ReviewController::class, 'moderate']);
});

// Admin: customer management
Route::middleware(['auth:sanctum', 'permission:customers.manage'])->prefix('admin/customers')->group(function () {
    Route::middleware('permission:customers.analytics')->group(function () {
        Route::get('/metrics', [App\Http\Controllers\Api\AdminCustomerGrowthController::class, 'metrics']);
    });

    Route::get('/segments', [App\Http\Controllers\Api\AdminCustomerGrowthController::class, 'listSegments']);
    Route::get('/segments/{segment}', [App\Http\Controllers\Api\AdminCustomerGrowthController::class, 'segmentCustomers']);
    Route::get('/data-quality', [App\Http\Controllers\Api\AdminCustomerGrowthController::class, 'dataQuality']);
    Route::get('/corporate-inquiries', [App\Http\Controllers\Api\CorporateInquiryController::class, 'adminIndex']);

    Route::get('/', [App\Http\Controllers\Api\AdminCustomerController::class, 'index']);
    Route::get('/{id}/growth-summary', [App\Http\Controllers\Api\AdminCustomerGrowthController::class, 'growthSummary']);
    Route::get('/{id}/activity', [App\Http\Controllers\Api\AdminCustomerGrowthController::class, 'activity']);
    Route::post('/{id}/tags', [App\Http\Controllers\Api\AdminCustomerGrowthController::class, 'attachTag']);
    Route::delete('/{id}/tags/{tag}', [App\Http\Controllers\Api\AdminCustomerGrowthController::class, 'detachTag']);
    Route::post('/{id}/follow-up-note', [App\Http\Controllers\Api\AdminCustomerGrowthController::class, 'followUpNote']);

    Route::middleware('permission:integrations.sms')->group(function () {
        Route::post('/{id}/send-sms', [App\Http\Controllers\Api\AdminCustomerGrowthController::class, 'sendSms']);
    });

    Route::get('/{id}', [App\Http\Controllers\Api\AdminCustomerController::class, 'show']);
    Route::patch('/{id}', [App\Http\Controllers\Api\AdminCustomerController::class, 'update']);
    Route::patch('/{id}/phone', [App\Http\Controllers\Api\AdminCustomerController::class, 'changePhone']);
    Route::post('/{id}/merge', [App\Http\Controllers\Api\AdminCustomerController::class, 'merge']);
    Route::delete('/{id}', [App\Http\Controllers\Api\AdminCustomerController::class, 'destroy']);

    Route::middleware('permission:customers.credit.manage')->group(function () {
        Route::get('/{id}/credit', [App\Http\Controllers\Api\CustomerCreditController::class, 'show']);
        Route::patch('/{id}/credit', [App\Http\Controllers\Api\CustomerCreditController::class, 'update']);
        Route::get('/{id}/credit/invoices', [App\Http\Controllers\Api\CustomerCreditController::class, 'invoices']);
        Route::get('/{id}/credit/ledger', [App\Http\Controllers\Api\CustomerCreditController::class, 'ledger']);
    });

    Route::middleware('permission:customers.credit.repay')->group(function () {
        Route::post('/{id}/credit/repayments', [App\Http\Controllers\Api\CustomerCreditController::class, 'repay']);
    });

    Route::middleware('permission:customers.deposit.manage')->group(function () {
        Route::get('/{id}/deposit', [App\Http\Controllers\Api\CustomerDepositController::class, 'show']);
        Route::patch('/{id}/deposit', [App\Http\Controllers\Api\CustomerDepositController::class, 'update']);
        Route::post('/{id}/deposit/top-up', [App\Http\Controllers\Api\CustomerDepositController::class, 'topUp']);
    });

    Route::middleware('permission:customers.deposit.adjust')->group(function () {
        Route::post('/{id}/deposit/adjust', [App\Http\Controllers\Api\CustomerDepositController::class, 'adjust']);
    });
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
Route::middleware(['auth:sanctum', 'staff.token', 'permission:reservations.manage'])->prefix('admin/reservations')->group(function () {
    Route::get('/', [ReservationController::class, 'index']);
    Route::patch('/{id}/status', [ReservationController::class, 'updateStatus']);
    Route::get('/settings', [ReservationController::class, 'getSettings']);
    Route::patch('/settings', [ReservationController::class, 'updateSettings']);
});

// ─── Time Clock ────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
    Route::get('/time-clock/status', [App\Http\Controllers\Api\TimeClockController::class, 'status'])
        ->middleware('permission:pos.time_clock');
    Route::post('/time-clock/in', [App\Http\Controllers\Api\TimeClockController::class, 'clockIn'])
        ->middleware('permission:pos.time_clock');
    Route::post('/time-clock/out', [App\Http\Controllers\Api\TimeClockController::class, 'clockOut'])
        ->middleware('permission:pos.time_clock');
    Route::get('/time-clock/history', [App\Http\Controllers\Api\TimeClockController::class, 'history'])
        ->middleware('permission:pos.time_clock');
    Route::get('/time-clock/summary', [App\Http\Controllers\Api\TimeClockController::class, 'summary'])
        ->middleware('permission:pos.time_clock');
});

// ─── Barcode Label Data ──────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
    Route::get('/items/{id}/barcode-label', [ItemController::class, 'barcodeLabel']);
});

// ─── Customer Display (public — no auth) ────────────────────────────────────
// Uses tracking_token (opaque, 32-char random) — not order_number — to prevent
// enumeration of in-progress orders. The POS app appends /display/{token} to
// the customer-facing screen URL at order creation time.
Route::get('/display/{token}', [App\Http\Controllers\Api\CustomerDisplayController::class, 'show'])
    ->middleware('throttle:60,1');

// ─── Offline POS Sync (legacy — canonical: POST /api/pos/offline-sync) ───────
Route::middleware(['auth:sanctum', 'staff.token', 'permission:pos.ring_sales', 'device.active', 'throttle:20,1'])->group(function () {
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
Route::middleware(['auth:sanctum', 'staff.token', 'permission:integrations.xero'])->group(function () {
    Route::get('/xero/connect', [App\Http\Controllers\Api\XeroController::class, 'connect']);
    Route::get('/xero/callback', [App\Http\Controllers\Api\XeroController::class, 'callback']);
    Route::get('/xero/status', [App\Http\Controllers\Api\XeroController::class, 'status']);
    Route::post('/xero/disconnect', [App\Http\Controllers\Api\XeroController::class, 'disconnect']);
    Route::post('/xero/invoices/{id}/push', [App\Http\Controllers\Api\XeroController::class, 'pushInvoice']);
    Route::post('/xero/expenses/{id}/push', [App\Http\Controllers\Api\XeroController::class, 'pushExpense']);
    Route::get('/xero/logs', [App\Http\Controllers\Api\XeroController::class, 'logs']);
});

// ─── Webhook Subscriptions (admin-only) ────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token', 'permission:integrations.webhooks'])->group(function () {
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
Route::get('/site-settings/public', [App\Http\Controllers\Api\SiteSettingsController::class, 'public'])
    ->middleware('throttle:60,1');
Route::middleware(['auth:sanctum', 'permission:website.manage'])->group(function () {
    Route::get('/site-settings', [App\Http\Controllers\Api\SiteSettingsController::class, 'index']);
    Route::put('/site-settings', [App\Http\Controllers\Api\SiteSettingsController::class, 'update']);
    Route::post('/site-settings/upload', [App\Http\Controllers\Api\SiteSettingsController::class, 'upload']);
});

// ─── Permissions Management (Owner only) ───────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:roles_permissions.manage'])->group(function () {
    Route::get('/permissions', [App\Http\Controllers\Api\PermissionController::class, 'index']);
    Route::get('/roles/{slug}/permissions', [App\Http\Controllers\Api\RolePermissionController::class, 'show']);
    Route::put('/roles/{slug}/permissions', [App\Http\Controllers\Api\RolePermissionController::class, 'update']);
    Route::get('/users/{user}/permissions', [App\Http\Controllers\Api\PermissionController::class, 'show']);
    Route::put('/users/{user}/permissions', [App\Http\Controllers\Api\PermissionController::class, 'update']);
});

// ─── POS Admin oversight (reports.view) ──────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:reports.view'])->prefix('admin')->group(function () {
    Route::get('/pos/overview', [App\Http\Controllers\Api\PosAdminController::class, 'overview']);
    Route::get('/pos/staff-options', [App\Http\Controllers\Api\PosAdminController::class, 'staffOptions']);
    Route::get('/audit-logs', [App\Http\Controllers\Api\AuditLogController::class, 'index']);
    Route::get('/audit-logs/actions', [App\Http\Controllers\Api\AuditLogController::class, 'actions']);
});

// ─── System Health ─────────────────────────────────────────────────────────
// Canonical: GET /api/health (see top of file). This alias is kept for any
// external monitors that may reference it — prefer /api/health for new usage.
Route::get('/system/health', [App\Http\Controllers\Api\SystemHealthController::class, 'public']);

// Protected admin health — returns full details for internal monitoring
Route::middleware(['auth:sanctum', 'permission:website.manage'])
    ->get('/admin/system/health', [App\Http\Controllers\Api\SystemHealthController::class, 'admin']);

Route::middleware(['auth:sanctum', 'permission:website.manage'])
    ->get('/admin/system/health/detailed', [App\Http\Controllers\Api\SystemHealthController::class, 'detailed']);

Route::middleware(['auth:sanctum', 'permission:website.manage'])->prefix('admin/pos')->group(function () {
    Route::get('/maintenance-preview', [App\Http\Controllers\Api\PosAdminController::class, 'maintenancePreview']);
    Route::post('/cleanup-stale-tickets', [App\Http\Controllers\Api\PosAdminController::class, 'cleanupStaleTickets']);
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

// ─── Driver Location for customers / staff ──────────────────────────────────
// Throttled; accessible with customer token, staff token, or driver token
Route::middleware(['auth:sanctum'])->group(function (): void {
    Route::get('/driver/deliveries/{order}/location', [App\Http\Controllers\Api\DriverLocationController::class, 'forOrder'])
        ->middleware('throttle:60,1');
});
