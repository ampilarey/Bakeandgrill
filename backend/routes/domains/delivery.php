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

