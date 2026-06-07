// ─── Tips, Scheduling, Waste, Wait Time ──────────────────────────────────────

// Public wait time estimate
Route::get('/wait-time', [App\Http\Controllers\Api\WaitTimeController::class, 'estimate']);

// Staff Scheduling (admin)
Route::middleware(['auth:sanctum', 'staff.token', 'permission:staff.schedule'])->prefix('admin/schedules')->group(function () {
    Route::get('/', [App\Http\Controllers\Api\ScheduleController::class, 'index']);
    Route::post('/', [App\Http\Controllers\Api\ScheduleController::class, 'store']);
    Route::patch('/{id}', [App\Http\Controllers\Api\ScheduleController::class, 'update']);
    Route::delete('/{id}', [App\Http\Controllers\Api\ScheduleController::class, 'destroy']);
});

// Waste Logs (staff)
Route::middleware(['auth:sanctum', 'staff.token', 'permission:inventory.manage'])->prefix('waste-logs')->group(function () {
    Route::get('/', [App\Http\Controllers\Api\WasteLogController::class, 'index']);
    Route::get('/summary', [App\Http\Controllers\Api\WasteLogController::class, 'summary']);
    Route::post('/', [App\Http\Controllers\Api\WasteLogController::class, 'store']);
});

// ─── Item Variants ────────────────────────────────────────────────────────────

// Admin: full CRUD for variants (requires menu.manage permission)
Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->group(function () {
    Route::get('/items/{itemId}/variants', [App\Http\Controllers\Api\VariantController::class, 'index']);
    Route::post('/items/{itemId}/variants', [App\Http\Controllers\Api\VariantController::class, 'store']);
    Route::patch('/items/{itemId}/variants/{id}', [App\Http\Controllers\Api\VariantController::class, 'update']);
    Route::delete('/items/{itemId}/variants/{id}', [App\Http\Controllers\Api\VariantController::class, 'destroy']);
});

// ─── Item Photo Gallery ───────────────────────────────────────────────────────

// Public: list photos for an item
Route::get('/items/{itemId}/photos', [App\Http\Controllers\Api\ItemPhotoController::class, 'index']);

// Admin: manage photos
Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->group(function () {
    Route::post('/items/{itemId}/photos', [App\Http\Controllers\Api\ItemPhotoController::class, 'store']);
    Route::patch('/items/{itemId}/photos/{photoId}', [App\Http\Controllers\Api\ItemPhotoController::class, 'update']);
    Route::delete('/items/{itemId}/photos/{photoId}', [App\Http\Controllers\Api\ItemPhotoController::class, 'destroy']);
});

// ─── Daily Specials ───────────────────────────────────────────────────────────

// Public: currently active specials
Route::get('/specials', [App\Http\Controllers\Api\DailySpecialController::class, 'active']);

// Admin: CRUD
Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->prefix('admin/specials')->group(function () {
    Route::get('/', [App\Http\Controllers\Api\DailySpecialController::class, 'index']);
    Route::get('/{id}', [App\Http\Controllers\Api\DailySpecialController::class, 'show']);
    Route::post('/', [App\Http\Controllers\Api\DailySpecialController::class, 'store']);
    Route::patch('/{id}', [App\Http\Controllers\Api\DailySpecialController::class, 'update']);
    Route::delete('/{id}', [App\Http\Controllers\Api\DailySpecialController::class, 'destroy']);
});

// ─── Push Notification Subscriptions ─────────────────────────────────────────

// Public: VAPID public key for subscription setup (no auth needed)
Route::get('/push/vapid-key', [App\Http\Controllers\Api\PushSubscriptionController::class, 'vapidKey']);

Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
    Route::post('/push/subscribe', [App\Http\Controllers\Api\PushSubscriptionController::class, 'subscribe'])
        ->middleware('throttle:5,1');
    Route::post('/push/unsubscribe', [App\Http\Controllers\Api\PushSubscriptionController::class, 'unsubscribe'])
        ->middleware('throttle:5,1');
});

