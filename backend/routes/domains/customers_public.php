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

    Route::middleware('permission:customers.deposit.view')->group(function () {
        Route::get('/{id}/deposit', [App\Http\Controllers\Api\CustomerDepositController::class, 'show']);
        Route::get('/{id}/deposit/ledger', [App\Http\Controllers\Api\CustomerDepositController::class, 'ledger']);
    });

    Route::middleware('permission:customers.deposit.freeze')->group(function () {
        Route::patch('/{id}/deposit', [App\Http\Controllers\Api\CustomerDepositController::class, 'update']);
    });

    Route::middleware('permission:customers.deposit.receive')->group(function () {
        Route::post('/{id}/deposit/top-up', [App\Http\Controllers\Api\CustomerDepositController::class, 'topUp']);
    });

    Route::middleware('permission:customers.deposit.adjust')->group(function () {
        Route::post('/{id}/deposit/adjust', [App\Http\Controllers\Api\CustomerDepositController::class, 'adjust']);
    });

    Route::middleware('permission:customers.deposit.refund')->group(function () {
        Route::post('/{id}/deposit/refund', [App\Http\Controllers\Api\CustomerDepositController::class, 'refund']);
    });

    Route::middleware('permission:customers.deposit.transfer_credit')->group(function () {
        Route::post('/{id}/deposit/transfer-to-credit', [App\Http\Controllers\Api\CustomerDepositController::class, 'transferToCredit']);
    });
});

