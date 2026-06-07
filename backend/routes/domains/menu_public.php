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

