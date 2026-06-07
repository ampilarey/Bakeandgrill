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

