<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Loyalty program routes (customer, admin, POS hold/release)
|--------------------------------------------------------------------------
| Loaded at top level from routes/api.php.
| POS loyalty twins are registered in domains/orders.php.
*/

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
