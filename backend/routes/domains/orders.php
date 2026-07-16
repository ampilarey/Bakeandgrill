<?php

declare(strict_types=1);

require __DIR__ . '/_helpers.php';

/*
|--------------------------------------------------------------------------
| Staff order routes (POS lifecycle, payments on ticket, refunds, receipts)
|--------------------------------------------------------------------------
| Sections loaded inside auth:sanctum + staff.token group in routes/api.php:
|   core     — order CRUD, refunds, receipts (after devices)
|   pos_ops  — POS customer lookup, pos prefix, shifts (after kitchen production)
|   tables   — table management (after reporting)
| Delivery/display routes: delivery section at top level.
*/

if (routes_domain_section_is('orders', 'core') && !routes_domain_loaded('orders.core')) {
    routes_domain_mark_loaded('orders.core');

    // Orders
    Route::get('/orders', [App\Http\Controllers\Api\Orders\OrderCreationController::class, 'index']);
    Route::post('/orders', [App\Http\Controllers\Api\Orders\OrderCreationController::class, 'store'])
        ->middleware(['permission:pos.ring_sales', 'device.active']);
    Route::post('/orders/sync', [App\Http\Controllers\Api\Orders\OrderCreationController::class, 'sync'])
        ->middleware(['permission:pos.ring_sales', 'device.active']);
    Route::get('/orders/{id}', [App\Http\Controllers\Api\Orders\OrderCreationController::class, 'show']);
    Route::post('/orders/{id}/hold', [App\Http\Controllers\Api\Orders\OrderStatusController::class, 'hold'])
        ->middleware(['permission:pos.hold_resume', 'throttle:20,1']);
    Route::post('/orders/{id}/resume', [App\Http\Controllers\Api\Orders\OrderStatusController::class, 'resume'])
        ->middleware(['permission:pos.hold_resume', 'throttle:20,1']);
    Route::post('/orders/{id}/fire-to-kitchen', [App\Http\Controllers\Api\Orders\OrderStatusController::class, 'fireToKitchen'])
        ->middleware(['permission:pos.hold_resume', 'throttle:20,1']);
    Route::post('/orders/{id}/send-pay-link', [App\Http\Controllers\Api\Orders\OrderPaymentController::class, 'sendPayLink'])
        ->middleware(['permission:orders.send_payment_link', 'throttle:10,1']);
    Route::post('/orders/{id}/start-cooking', [App\Http\Controllers\Api\Orders\OrderStatusController::class, 'startCooking'])
        ->middleware(['permission:pos.manage_order_status', 'throttle:30,1']);
    Route::post('/orders/{id}/mark-ready', [App\Http\Controllers\Api\Orders\OrderStatusController::class, 'markReady'])
        ->middleware(['permission:pos.manage_order_status', 'throttle:30,1']);
    Route::post('/orders/{id}/mark-picked-up', [App\Http\Controllers\Api\Orders\OrderStatusController::class, 'markPickedUp'])
        ->middleware(['permission:pos.manage_order_status', 'throttle:30,1']);
    Route::post('/orders/{id}/cancel', [App\Http\Controllers\Api\Orders\OrderStatusController::class, 'cancel'])
        ->middleware(['permission:orders.void', 'device.active', 'throttle:10,1']);
    Route::patch('/orders/{id}/items', [App\Http\Controllers\Api\Orders\OrderItemController::class, 'updateItems'])
        ->middleware(['permission:pos.hold_resume', 'throttle:30,1']);
    Route::post('/orders/{id}/merge', [App\Http\Controllers\Api\Orders\OrderItemController::class, 'merge'])
        ->middleware(['permission:pos.hold_resume', 'throttle:10,1']);
    Route::post('/orders/{id}/split', [App\Http\Controllers\Api\Orders\OrderItemController::class, 'split'])
        ->middleware(['permission:pos.hold_resume', 'throttle:10,1']);
    Route::post('/orders/{id}/payments', [App\Http\Controllers\Api\Orders\OrderPaymentController::class, 'addPayments'])
        ->middleware(['permission:pos.ring_sales', 'device.active', 'throttle:20,1']);
    Route::post('/orders/{id}/send-bill', [App\Http\Controllers\Api\Orders\OrderPaymentController::class, 'sendBill'])
        ->middleware(['permission:orders.send_sms_bill', 'throttle:10,1']);
    Route::patch('/orders/{id}/customer', [App\Http\Controllers\Api\Orders\OrderCustomerController::class, 'updateCustomer'])
        ->middleware(['permission:pos.ring_sales', 'throttle:30,1']);

    // Receipts (staff)
    Route::get('/orders/{orderId}/receipt-link', [App\Http\Controllers\Api\ReceiptController::class, 'linkForOrder']);
    Route::post('/receipts/{orderId}/send', [App\Http\Controllers\Api\ReceiptController::class, 'send']);

    // Refunds
    Route::get('/refunds', [App\Http\Controllers\Api\RefundController::class, 'index'])
        ->middleware('permission:orders.refund');
    Route::get('/refunds/{id}', [App\Http\Controllers\Api\RefundController::class, 'show'])
        ->middleware('permission:orders.refund');
    Route::post('/orders/{orderId}/refunds', [App\Http\Controllers\Api\RefundController::class, 'store'])
        ->middleware(['permission:orders.refund', 'throttle:10,1']);
}

if (routes_domain_section_is('orders', 'pos_ops') && !routes_domain_loaded('orders.pos_ops')) {
    routes_domain_mark_loaded('orders.pos_ops');

    // Customers — lightweight POS lookup / quick-create (any authenticated staff)
    Route::get('/customers/search', [App\Http\Controllers\Api\CustomerController::class, 'search'])
        ->middleware(['permission:customers.lookup', 'throttle:60,1']);
    Route::post('/customers/quick', [App\Http\Controllers\Api\CustomerController::class, 'quickCreate'])
        ->middleware(['permission:customers.create', 'throttle:30,1']);
    Route::patch('/customers/{id}', [App\Http\Controllers\Api\CustomerController::class, 'updateFromPos'])
        ->middleware(['permission:customers.lookup', 'throttle:30,1']);
    Route::get('/customers/{id}/pos-summary', [App\Http\Controllers\Api\CustomerController::class, 'posSummary'])
        ->middleware(['permission:customers.lookup', 'throttle:60,1']);
    Route::get('/customers/{id}/addresses', [App\Http\Controllers\Api\CustomerAddressController::class, 'indexForCustomer'])
        ->middleware('throttle:60,1');

    // ── POS rewards on an in-progress ticket ─────────────────────────────────
    Route::prefix('pos')->group(function (): void {
        Route::post('/offline-sync', [App\Http\Controllers\Api\PosOfflineSyncController::class, 'sync'])
            ->middleware(['permission:pos.ring_sales', 'device.active', 'throttle:20,1']);

        Route::post('/loyalty/preview', [App\Http\Controllers\Api\LoyaltyController::class, 'posHoldPreview']);
        Route::post('/loyalty/hold', [App\Http\Controllers\Api\LoyaltyController::class, 'posHold']);
        Route::delete('/loyalty/hold/{orderId}', [App\Http\Controllers\Api\LoyaltyController::class, 'posReleaseHold']);

        Route::post('/orders/{orderId}/gift-card', [App\Http\Controllers\Api\GiftCardController::class, 'staffApplyToOrder']);
        Route::delete('/orders/{orderId}/gift-card', [App\Http\Controllers\Api\GiftCardController::class, 'staffRemoveFromOrder']);
    });

    // Shifts + cash drawer
    Route::get('/shifts/current', [App\Http\Controllers\Api\ShiftController::class, 'current'])
        ->middleware('permission.any:pos.ring_sales,pos.open_shift,pos.close_shift,shifts.view_own_history');
    Route::get('/shifts/history', [App\Http\Controllers\Api\ShiftController::class, 'history'])
        ->middleware('permission:shifts.view_own_history');
    Route::get('/shifts/live', [App\Http\Controllers\Api\ShiftController::class, 'live'])
        ->middleware('permission:shifts.view_all_history');
    Route::get('/shifts/{id}/summary', [App\Http\Controllers\Api\ShiftController::class, 'summary'])
        ->middleware('permission:shifts.view_own_history');
    Route::post('/shifts/open', [App\Http\Controllers\Api\ShiftController::class, 'open'])
        ->middleware(['permission:pos.open_shift', 'throttle:5,1']);
    Route::post('/shifts/{id}/close', [App\Http\Controllers\Api\ShiftController::class, 'close'])
        ->middleware(['permission:pos.close_shift', 'throttle:5,1']);
    Route::post('/shifts/{id}/force-close', [App\Http\Controllers\Api\ShiftController::class, 'forceClose'])
        ->middleware(['permission:shifts.view_all_history', 'throttle:5,1']);
    Route::post('/shifts/{id}/cash-movements', [App\Http\Controllers\Api\CashMovementController::class, 'store'])
        ->middleware(['permission:payments.cash_in_out', 'device.active', 'throttle:30,1']);
}

if (routes_domain_section_is('orders', 'tables') && !routes_domain_loaded('orders.tables')) {
    routes_domain_mark_loaded('orders.tables');

    // Tables
    Route::get('/tables', [App\Http\Controllers\Api\TableController::class, 'index'])->middleware('permission:orders.view');
    Route::post('/tables', [App\Http\Controllers\Api\TableController::class, 'store'])->middleware('permission:orders.manage');
    Route::patch('/tables/{id}', [App\Http\Controllers\Api\TableController::class, 'update'])->middleware('permission:orders.manage');
    Route::post('/tables/{id}/open', [App\Http\Controllers\Api\TableController::class, 'open'])
        ->middleware(['permission:orders.manage', 'device.active']);
    Route::post('/tables/{tableId}/orders/{orderId}/items', [App\Http\Controllers\Api\TableController::class, 'addItems'])
        ->middleware(['permission:orders.manage', 'device.active']);
    Route::post('/tables/{id}/close', [App\Http\Controllers\Api\TableController::class, 'close'])->middleware('permission:orders.manage');
    Route::post('/tables/merge', [App\Http\Controllers\Api\TableController::class, 'merge'])->middleware('permission:orders.manage');
    Route::post('/tables/{id}/split', [App\Http\Controllers\Api\TableController::class, 'split'])->middleware('permission:orders.manage');
}

if (routes_domain_section_is('orders', 'delivery') && !routes_domain_loaded('orders.delivery')) {
    routes_domain_mark_loaded('orders.delivery');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/orders/delivery', [App\Http\Controllers\Api\DeliveryOrderController::class, 'store']);
        Route::patch('/orders/{order}/delivery', [App\Http\Controllers\Api\DeliveryOrderController::class, 'update']);
    });

    Route::middleware(['auth:sanctum', 'staff.token', 'permission:orders.manage'])->group(function () {
        Route::get('/delivery/drivers', [App\Http\Controllers\Api\DeliveryDriverController::class, 'index']);
        Route::post('/delivery/drivers', [App\Http\Controllers\Api\DeliveryDriverController::class, 'store']);
        Route::patch('/delivery/drivers/{driver}', [App\Http\Controllers\Api\DeliveryDriverController::class, 'update']);
        Route::delete('/delivery/drivers/{driver}', [App\Http\Controllers\Api\DeliveryDriverController::class, 'destroy']);
        Route::post('/delivery/orders/{order}/assign-driver', [App\Http\Controllers\Api\DeliveryDriverController::class, 'assignDriver']);
    });

    Route::get('/display/{token}', [App\Http\Controllers\Api\CustomerDisplayController::class, 'show'])
        ->middleware('throttle:60,1');

    Route::middleware(['auth:sanctum', 'staff.token', 'permission:pos.ring_sales', 'device.active', 'throttle:20,1'])->group(function () {
        Route::post('/offline/sync', [App\Http\Controllers\Api\OfflineSyncController::class, 'sync']);
    });
}
