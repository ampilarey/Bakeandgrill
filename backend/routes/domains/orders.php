<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Staff order routes (POS lifecycle, payments on ticket, refunds, receipts)
|--------------------------------------------------------------------------
| Loaded inside auth:sanctum + staff.token group in routes/api.php.
*/

// Orders
Route::get('/orders', [App\Http\Controllers\Api\OrderController::class, 'index']);
Route::post('/orders', [App\Http\Controllers\Api\OrderController::class, 'store'])
    ->middleware(['permission:pos.ring_sales', 'device.active']);
Route::post('/orders/sync', [App\Http\Controllers\Api\OrderController::class, 'sync'])
    ->middleware(['permission:pos.ring_sales', 'device.active']);
Route::get('/orders/{id}', [App\Http\Controllers\Api\OrderController::class, 'show']);
Route::post('/orders/{id}/hold', [App\Http\Controllers\Api\OrderController::class, 'hold'])
    ->middleware(['permission:pos.hold_resume', 'throttle:20,1']);
Route::post('/orders/{id}/resume', [App\Http\Controllers\Api\OrderController::class, 'resume'])
    ->middleware(['permission:pos.hold_resume', 'throttle:20,1']);
// Phone-call pickup workflow: send a held ticket to the kitchen
// without taking payment yet (POS "Save & Fire"), then later SMS
// the customer a BML Connect pay link for the remaining balance.
Route::post('/orders/{id}/fire-to-kitchen', [App\Http\Controllers\Api\OrderController::class, 'fireToKitchen'])
    ->middleware(['permission:pos.hold_resume', 'throttle:20,1']);
Route::post('/orders/{id}/send-pay-link', [App\Http\Controllers\Api\OrderController::class, 'sendPayLink'])
    ->middleware(['permission:orders.send_payment_link', 'throttle:10,1']);
// Cashier-callable lifecycle bumps — POS equivalents of KDS
// bump/complete. Lets a cashier-only setup (no KDS terminal) move
// pickup orders through ready → completed and trigger the
// customer-facing SMS chain without the kitchen needing extra
// hardware.
Route::post('/orders/{id}/start-cooking', [App\Http\Controllers\Api\OrderController::class, 'startCooking'])
    ->middleware(['permission:pos.manage_order_status', 'throttle:30,1']);
Route::post('/orders/{id}/mark-ready', [App\Http\Controllers\Api\OrderController::class, 'markReady'])
    ->middleware(['permission:pos.manage_order_status', 'throttle:30,1']);
Route::post('/orders/{id}/mark-picked-up', [App\Http\Controllers\Api\OrderController::class, 'markPickedUp'])
    ->middleware(['permission:pos.manage_order_status', 'throttle:30,1']);
// Void a non-terminal ticket from the POS Active Orders panel —
// returns deducted POS stock, releases promo/loyalty/gift-card
// holds, frees the dine-in table, audit-logs the cashier + reason.
// Refuses paid/completed/refunded states (those go via refund).
// Tighter throttle than mark-ready because voids are destructive.
// Permission gate (orders.void) is ALSO enforced inside the controller
// so the policy + DB-override path stays the single source of truth.
Route::post('/orders/{id}/cancel', [App\Http\Controllers\Api\OrderController::class, 'cancel'])
    ->middleware(['permission:orders.void', 'device.active', 'throttle:10,1']);
// Active-ticket editing — POS "Save changes" lets a cashier swap
// out the line items on a parked / cooking / ready ticket and
// reprint the kitchen chit in one round-trip.
Route::patch('/orders/{id}/items', [App\Http\Controllers\Api\OrderController::class, 'updateItems'])
    ->middleware(['permission:pos.hold_resume', 'throttle:30,1']);
// Open-ticket consolidation — merge two tickets into one or split
// selected items off into a sibling ticket. Same editable-state
// guards as updateItems.
Route::post('/orders/{id}/merge', [App\Http\Controllers\Api\OrderController::class, 'merge'])
    ->middleware(['permission:pos.hold_resume', 'throttle:10,1']);
Route::post('/orders/{id}/split', [App\Http\Controllers\Api\OrderController::class, 'split'])
    ->middleware(['permission:pos.hold_resume', 'throttle:10,1']);
Route::post('/orders/{id}/payments', [App\Http\Controllers\Api\OrderController::class, 'addPayments'])
    ->middleware(['permission:pos.ring_sales', 'device.active', 'throttle:20,1']);
Route::post('/orders/{id}/send-bill', [App\Http\Controllers\Api\OrderController::class, 'sendBill'])
    ->middleware(['permission:orders.send_sms_bill', 'throttle:10,1']);
Route::patch('/orders/{id}/customer', [App\Http\Controllers\Api\OrderController::class, 'updateCustomer'])
    ->middleware(['permission:pos.ring_sales', 'throttle:30,1']);

// Receipts (staff)
Route::get('/orders/{orderId}/receipt-link', [App\Http\Controllers\Api\ReceiptController::class, 'linkForOrder']);
Route::post('/receipts/{orderId}/send', [App\Http\Controllers\Api\ReceiptController::class, 'send']);

// Refunds — list/show/create all require refund.process (owner/manager
// or explicit orders.refund grant). Gate::authorize in controller matches.
Route::get('/refunds', [App\Http\Controllers\Api\RefundController::class, 'index'])
    ->middleware('permission:orders.refund');
Route::get('/refunds/{id}', [App\Http\Controllers\Api\RefundController::class, 'show'])
    ->middleware('permission:orders.refund');
Route::post('/orders/{orderId}/refunds', [App\Http\Controllers\Api\RefundController::class, 'store'])
    ->middleware(['permission:orders.refund', 'throttle:10,1']);
