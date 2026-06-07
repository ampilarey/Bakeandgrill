Route::middleware(['auth:sanctum', 'customer.token'])->prefix('customer')->group(function () {
    Route::get('/me', [CustomerController::class, 'me']);
    Route::get('/credit', [CustomerController::class, 'credit']);
    Route::get('/deposit', [CustomerController::class, 'deposit']);
    Route::patch('/credit/preferences', [CustomerController::class, 'updateCreditPreferences']);
    Route::get('/orders', [CustomerController::class, 'orders']);
    Route::get('/orders/{id}', [CustomerController::class, 'show']);
    Route::post('/orders', [OrderController::class, 'storeCustomer']);
    Route::patch('/profile', [CustomerController::class, 'update']);
    Route::post('/cart/snapshot', [App\Http\Controllers\Api\CustomerCartController::class, 'snapshot']);
    Route::get('/addresses', [App\Http\Controllers\Api\CustomerAddressController::class, 'index']);
    Route::post('/addresses', [App\Http\Controllers\Api\CustomerAddressController::class, 'store']);
    Route::patch('/addresses/{id}', [App\Http\Controllers\Api\CustomerAddressController::class, 'update']);
    Route::delete('/addresses/{id}', [App\Http\Controllers\Api\CustomerAddressController::class, 'destroy']);
    Route::post('/addresses/{id}/default', [App\Http\Controllers\Api\CustomerAddressController::class, 'setDefault']);

    // Profile completion and password management
    Route::post('/complete-profile', [App\Http\Controllers\Api\CustomerProfileController::class, 'completeProfile']);
    Route::post('/change-password', [App\Http\Controllers\Api\CustomerProfileController::class, 'changePassword']);
});
