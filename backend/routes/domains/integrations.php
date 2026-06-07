// ─── Barcode Label Data ──────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
    Route::get('/items/{id}/barcode-label', [ItemController::class, 'barcodeLabel']);
});

// ─── Customer Display (public — no auth) ────────────────────────────────────
// Uses tracking_token (opaque, 32-char random) — not order_number — to prevent
// enumeration of in-progress orders. The POS app appends /display/{token} to
// the customer-facing screen URL at order creation time.
Route::get('/display/{token}', [App\Http\Controllers\Api\CustomerDisplayController::class, 'show'])
    ->middleware('throttle:60,1');

// ─── Offline POS Sync (legacy — canonical: POST /api/pos/offline-sync) ───────
Route::middleware(['auth:sanctum', 'staff.token', 'permission:pos.ring_sales', 'device.active', 'throttle:20,1'])->group(function () {
    Route::post('/offline/sync', [App\Http\Controllers\Api\OfflineSyncController::class, 'sync']);
});

// ─── Stripe Payment Gateway ─────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/stripe/intent', [App\Http\Controllers\Api\StripeController::class, 'createIntent']);
});
// Stripe webhook — public, no auth, uses raw body
Route::post('/stripe/webhook', [App\Http\Controllers\Api\StripeController::class, 'webhook'])
    ->middleware('throttle:100,1');

// ─── Xero OAuth ─────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token', 'permission:integrations.xero'])->group(function () {
    Route::get('/xero/connect', [App\Http\Controllers\Api\XeroController::class, 'connect']);
    Route::get('/xero/callback', [App\Http\Controllers\Api\XeroController::class, 'callback']);
    Route::get('/xero/status', [App\Http\Controllers\Api\XeroController::class, 'status']);
    Route::post('/xero/disconnect', [App\Http\Controllers\Api\XeroController::class, 'disconnect']);
    Route::post('/xero/invoices/{id}/push', [App\Http\Controllers\Api\XeroController::class, 'pushInvoice']);
    Route::post('/xero/expenses/{id}/push', [App\Http\Controllers\Api\XeroController::class, 'pushExpense']);
    Route::get('/xero/logs', [App\Http\Controllers\Api\XeroController::class, 'logs']);
});

// ─── Webhook Subscriptions (admin-only) ────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token', 'permission:integrations.webhooks'])->group(function () {
    Route::get('/webhooks/events', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'supportedEvents']);
    Route::get('/webhooks', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'index']);
    Route::post('/webhooks', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'store']);
    Route::get('/webhooks/{id}', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'show']);
    Route::put('/webhooks/{id}', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'update']);
    Route::delete('/webhooks/{id}', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'destroy']);
    Route::post('/webhooks/{id}/rotate-secret', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'rotateSecret']);
    Route::get('/webhooks/{id}/logs', [App\Http\Controllers\Api\WebhookSubscriptionController::class, 'logs']);
});

// ─── Site Settings ──────────────────────────────────────────────────────────
Route::get('/site-settings/public', [App\Http\Controllers\Api\SiteSettingsController::class, 'public'])
    ->middleware('throttle:60,1');
Route::middleware(['auth:sanctum', 'permission:website.manage'])->group(function () {
    Route::get('/site-settings', [App\Http\Controllers\Api\SiteSettingsController::class, 'index']);
    Route::put('/site-settings', [App\Http\Controllers\Api\SiteSettingsController::class, 'update']);
    Route::post('/site-settings/upload', [App\Http\Controllers\Api\SiteSettingsController::class, 'upload']);
});

// ─── Permissions Management (Owner only) ───────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:roles_permissions.manage'])->group(function () {
    Route::get('/permissions', [App\Http\Controllers\Api\PermissionController::class, 'index']);
    Route::get('/roles/{slug}/permissions', [App\Http\Controllers\Api\RolePermissionController::class, 'show']);
    Route::put('/roles/{slug}/permissions', [App\Http\Controllers\Api\RolePermissionController::class, 'update']);
    Route::get('/users/{user}/permissions', [App\Http\Controllers\Api\PermissionController::class, 'show']);
    Route::put('/users/{user}/permissions', [App\Http\Controllers\Api\PermissionController::class, 'update']);
});

// ─── POS Admin oversight (reports.view) ──────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:reports.view'])->prefix('admin')->group(function () {
    Route::get('/pos/overview', [App\Http\Controllers\Api\PosAdminController::class, 'overview']);
    Route::get('/pos/staff-options', [App\Http\Controllers\Api\PosAdminController::class, 'staffOptions']);
    Route::get('/audit-logs', [App\Http\Controllers\Api\AuditLogController::class, 'index']);
    Route::get('/audit-logs/actions', [App\Http\Controllers\Api\AuditLogController::class, 'actions']);
});

// ─── System Health ─────────────────────────────────────────────────────────
// Canonical: GET /api/health (see top of file). This alias is kept for any
// external monitors that may reference it — prefer /api/health for new usage.
Route::get('/system/health', [App\Http\Controllers\Api\SystemHealthController::class, 'public']);

// Protected admin health — returns full details for internal monitoring
Route::middleware(['auth:sanctum', 'permission:website.manage'])
    ->get('/admin/system/health', [App\Http\Controllers\Api\SystemHealthController::class, 'admin']);

Route::middleware(['auth:sanctum', 'permission:website.manage'])
    ->get('/admin/system/health/detailed', [App\Http\Controllers\Api\SystemHealthController::class, 'detailed']);

Route::middleware(['auth:sanctum', 'permission:website.manage'])->prefix('admin/pos')->group(function () {
    Route::get('/maintenance-preview', [App\Http\Controllers\Api\PosAdminController::class, 'maintenancePreview']);
    Route::post('/cleanup-stale-tickets', [App\Http\Controllers\Api\PosAdminController::class, 'cleanupStaleTickets']);
});

