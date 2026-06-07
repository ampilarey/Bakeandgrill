// ─── Reservations ────────────────────────────────────────────────────────────
// Public: check slot availability
Route::get('/reservations/availability', [ReservationController::class, 'availability'])
    ->middleware('throttle:60,1');

// Public/customer: create & cancel reservations
Route::post('/reservations', [ReservationController::class, 'store'])
    ->middleware('throttle:10,10');

// Authenticated: list and cancel own reservations
Route::middleware('auth:sanctum')->group(function () {
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

// ─── Time Clock ────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
    Route::get('/time-clock/status', [App\Http\Controllers\Api\TimeClockController::class, 'status'])
        ->middleware('permission:pos.time_clock');
    Route::post('/time-clock/in', [App\Http\Controllers\Api\TimeClockController::class, 'clockIn'])
        ->middleware('permission:pos.time_clock');
    Route::post('/time-clock/out', [App\Http\Controllers\Api\TimeClockController::class, 'clockOut'])
        ->middleware('permission:pos.time_clock');
    Route::get('/time-clock/history', [App\Http\Controllers\Api\TimeClockController::class, 'history'])
        ->middleware('permission:pos.time_clock');
    Route::get('/time-clock/summary', [App\Http\Controllers\Api\TimeClockController::class, 'summary'])
        ->middleware('permission:pos.time_clock');
});

