<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Payment gateway routes (BML, Stripe, partial / zero-balance online pay)
|--------------------------------------------------------------------------
| Loaded from routes/api.php (mixed public + auth:sanctum).
*/

// Webhook — no auth, signature verified inside PaymentService::handleBmlWebhook
Route::post('/payments/bml/webhook', [App\Http\Controllers\Api\BmlWebhookController::class, 'handle'])
    ->withoutMiddleware([Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class])
    ->middleware('throttle:60,1');

// Initiate BML payment (customer only)
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/orders/{orderId}/pay/bml', [App\Http\Controllers\Api\PaymentController::class, 'initiateOnline']);
    Route::post('/orders/{orderId}/complete-zero-balance', [App\Http\Controllers\Api\PaymentController::class, 'completeZeroBalance']);
});

// Partial Online Payment
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/payments/online/initiate-partial', [App\Http\Controllers\Api\PaymentController::class, 'initiatePartial']);
});

// Stripe Payment Gateway
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/stripe/intent', [App\Http\Controllers\Api\StripeController::class, 'createIntent']);
});
// Stripe webhook — public, no auth, uses raw body
Route::post('/stripe/webhook', [App\Http\Controllers\Api\StripeController::class, 'webhook'])
    ->middleware('throttle:100,1');
