<?php

declare(strict_types=1);

use App\Http\Controllers\Api\ReservationController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Reservations and table booking routes
|--------------------------------------------------------------------------
| Loaded at top level from routes/api.php.
*/

// ─── Reservations ────────────────────────────────────────────────────────────
// Public: check slot availability
Route::get('/reservations/availability', [ReservationController::class, 'availability'])
    ->middleware('throttle:60,1');

// Public/customer: create & cancel reservations
Route::post('/reservations', [ReservationController::class, 'store'])
    ->middleware('throttle:10,10');

// Authenticated customers: list and cancel own reservations
Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
    Route::get('/reservations', [ReservationController::class, 'index']);
    Route::delete('/reservations/{id}', [ReservationController::class, 'destroy']);
});

// Staff: manage reservation status + settings
Route::middleware(['auth:sanctum', 'staff.token', 'permission:reservations.manage'])->prefix('admin/reservations')->group(function () {
    Route::get('/', [ReservationController::class, 'index']);
    Route::patch('/{id}/status', [ReservationController::class, 'updateStatus']);
    Route::get('/settings', [ReservationController::class, 'getSettings']);
    Route::patch('/settings', [ReservationController::class, 'updateSettings']);
});
