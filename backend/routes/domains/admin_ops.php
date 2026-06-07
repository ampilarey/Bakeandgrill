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

