<?php

declare(strict_types=1);

require __DIR__ . '/_helpers.php';

use App\Http\Controllers\Api\Auth\StaffAuthController;
use App\Http\Controllers\Api\CustomerController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Staff session bootstrap, ops settings, shifts, and staff administration
|--------------------------------------------------------------------------
| Session/settings/shifts block: loaded inside auth:sanctum + staff.token group.
| Admin staff routes: loaded at top level (second require in api.php).
*/

if (routes_domain_section_is('staff', 'protected') && !routes_domain_loaded('staff.protected')) {
    routes_domain_mark_loaded('staff.protected');

    // Get current user (staff)
    Route::get('/auth/me', [StaffAuthController::class, 'me']);

    // POS bootstrap — menu + current shift in one login round trip
    Route::get('/pos/bootstrap', [App\Http\Controllers\Api\PosBootstrapController::class, 'index'])
        ->middleware('throttle:120,1');
    // POS menu — channel refetch after order-type change (no shift payload)
    Route::get('/pos/menu', [App\Http\Controllers\Api\PosMenuController::class, 'index'])
        ->middleware('throttle:120,1');
    Route::patch('/auth/me/preferences', [StaffAuthController::class, 'updatePreferences']);

    // Online ordering gate — toggle (owner/manager) and public status is above
    Route::prefix('admin/ordering')->middleware('permission:settings.update')->group(function () {
        Route::post('/toggle', [App\Http\Controllers\Api\OnlineOrderingController::class, 'toggle']);
        Route::post('/override', [App\Http\Controllers\Api\OnlineOrderingController::class, 'override']);
        Route::put('/schedule', [App\Http\Controllers\Api\OnlineOrderingController::class, 'updateSchedule']);
        Route::put('/tomorrow-cutoff', [App\Http\Controllers\Api\OnlineOrderingController::class, 'updateTomorrowCutoff']);
        Route::get('/feature-gates', [App\Http\Controllers\Api\FeatureGateController::class, 'index']);
        Route::put('/feature-gates/{key}', [App\Http\Controllers\Api\FeatureGateController::class, 'update']);
        Route::post('/delivery-toggle', [App\Http\Controllers\Api\OnlineOrderingController::class, 'toggleDelivery']);
        Route::put('/delivery-schedule', [App\Http\Controllers\Api\OnlineOrderingController::class, 'updateDeliverySchedule']);
        Route::post('/delivery-override', [App\Http\Controllers\Api\OnlineOrderingController::class, 'deliveryOverride']);
        Route::post('/delivery-capacity', [App\Http\Controllers\Api\OnlineOrderingController::class, 'updateDeliveryCapacity']);
        Route::post('/catering-toggle', [App\Http\Controllers\Api\OnlineOrderingController::class, 'toggleCatering']);
        Route::put('/catering-schedule', [App\Http\Controllers\Api\OnlineOrderingController::class, 'updateCateringSchedule']);
        Route::post('/catering-override', [App\Http\Controllers\Api\OnlineOrderingController::class, 'cateringOverride']);
    });

    // ─── Service Availability & Maintenance (plan §12) ────────────────────────
    Route::prefix('admin/service-availability')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\ServiceAvailabilityController::class, 'index'])
            ->middleware('permission:service_availability.view');
        Route::get('/{key}/history', [App\Http\Controllers\Api\ServiceAvailabilityController::class, 'history'])
            ->middleware('permission:service_availability.view');
        Route::patch('/{key}', [App\Http\Controllers\Api\ServiceAvailabilityController::class, 'update'])
            ->middleware('permission:service_availability.manage_public');
        Route::post('/{key}/restore', [App\Http\Controllers\Api\ServiceAvailabilityController::class, 'restore'])
            ->middleware('permission:service_availability.restore');
        Route::post('/{key}/notify', [App\Http\Controllers\Api\ServiceAvailabilityController::class, 'notify'])
            ->middleware('permission:service_availability.notify');
        // Preset requires broadest permission by default; emergency preset
        // additionally requires the emergency slug (enforced in controller
        // logic once Stage 8 lands — for now the manage_public slug is the
        // baseline gate).
        Route::post('/preset/{preset}', [App\Http\Controllers\Api\ServiceAvailabilityController::class, 'preset'])
            ->middleware('permission:service_availability.manage_public');
    });

    Route::prefix('admin/delivery')->middleware('permission:settings.update')->group(function () {
        Route::get('/settings', [App\Http\Controllers\Api\DeliverySettingsController::class, 'show']);
        Route::patch('/settings', [App\Http\Controllers\Api\DeliverySettingsController::class, 'update']);
    });

    Route::prefix('admin/ops')->middleware('permission:settings.update')->group(function () {
        Route::get('/alerts', [App\Http\Controllers\Api\OpsAlertsController::class, 'show']);
        Route::patch('/alerts', [App\Http\Controllers\Api\OpsAlertsController::class, 'update']);
    });

    Route::prefix('admin/settings/service-charge')->middleware('permission:settings.update')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\ServiceChargeSettingsController::class, 'show']);
        Route::put('/', [App\Http\Controllers\Api\ServiceChargeSettingsController::class, 'update']);
    });
    Route::prefix('admin/settings/payment-commission')->middleware('permission:settings.update')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\PaymentCommissionSettingsController::class, 'show']);
        Route::put('/', [App\Http\Controllers\Api\PaymentCommissionSettingsController::class, 'update']);
    });
    Route::prefix('admin/settings/packaging-fee')->middleware('permission:settings.update')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\PackagingFeeSettingsController::class, 'show']);
        Route::match(['put', 'patch'], '/', [App\Http\Controllers\Api\PackagingFeeSettingsController::class, 'update']);
    });
    Route::prefix('admin/gst/settings')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\GstSettingsController::class, 'show'])
            ->middleware('permission:reports.financial');
        Route::put('/', [App\Http\Controllers\Api\GstSettingsController::class, 'update'])
            ->middleware('permission:settings.update');
    });
}

if (routes_domain_section_is('staff', 'admin') && !routes_domain_loaded('staff.admin')) {
    routes_domain_mark_loaded('staff.admin');

    // Staff-only: update internal notes on a customer profile
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:customers.manage'])->group(function () {
        Route::patch('/customers/{id}/notes', [CustomerController::class, 'updateNotes']);
    });

    // ─── Staff Notification Preferences ──────────────────────────────────────────
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:staff.update'])->group(function () {
        Route::get('/admin/staff/{userId}/notification-prefs', [App\Http\Controllers\Api\StaffNotificationPrefController::class, 'show']);
        Route::put('/admin/staff/{userId}/notification-prefs', [App\Http\Controllers\Api\StaffNotificationPrefController::class, 'update']);
    });

    // ─── Image Upload (Admin) ──────────────────────────────────────────────────
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->post('/admin/upload-image', [App\Http\Controllers\Api\ImageUploadController::class, 'store']);

    // ─── Central Media Library ────────────────────────────────────────────────
    Route::middleware(['auth:sanctum', 'staff.token'])->prefix('admin/media')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\MediaLibraryController::class, 'index'])
            ->middleware('permission:media.view');
        Route::post('/', [App\Http\Controllers\Api\MediaLibraryController::class, 'store'])
            ->middleware('permission:media.manage');
        Route::post('/reconcile', [App\Http\Controllers\Api\MediaLibraryController::class, 'reconcile'])
            ->middleware('permission:media.manage');

        // Video studio (must be before /{media} routes). Permission checked in controller.
        Route::get('/video/capabilities', [App\Http\Controllers\Api\VideoStudioController::class, 'capabilities']);
        Route::post('/video/probe', [App\Http\Controllers\Api\VideoStudioController::class, 'probe']);
        Route::post('/video/process', [App\Http\Controllers\Api\VideoStudioController::class, 'process']);

        Route::get('/collections', [App\Http\Controllers\Api\MediaCollectionController::class, 'index'])
            ->middleware('permission:media.view');
        Route::post('/collections', [App\Http\Controllers\Api\MediaCollectionController::class, 'store'])
            ->middleware('permission:media.manage');
        Route::patch('/collections/{collection}', [App\Http\Controllers\Api\MediaCollectionController::class, 'update'])
            ->middleware('permission:media.manage');
        Route::delete('/collections/{collection}', [App\Http\Controllers\Api\MediaCollectionController::class, 'destroy'])
            ->middleware('permission:media.manage');

        Route::patch('/{media}', [App\Http\Controllers\Api\MediaLibraryController::class, 'update'])
            ->middleware('permission:media.manage');
        Route::delete('/{media}', [App\Http\Controllers\Api\MediaLibraryController::class, 'destroy'])
            ->middleware('permission:media.manage');
        Route::get('/{media}/usage', [App\Http\Controllers\Api\MediaLibraryController::class, 'usage'])
            ->middleware('permission:media.view');
        Route::post('/{media}/edit', [App\Http\Controllers\Api\MediaLibraryController::class, 'edit'])
            ->middleware('permission:media.manage');
        Route::post('/{media}/restore', [App\Http\Controllers\Api\MediaLibraryController::class, 'restore'])
            ->middleware('permission:media.manage');
        Route::post('/{media}/collections', [App\Http\Controllers\Api\MediaLibraryController::class, 'syncCollections'])
            ->middleware('permission:media.manage');
        // Permission checked in controller (media.manage OR website.manage).
        Route::post('/{media}/use-as', [App\Http\Controllers\Api\MediaLibraryController::class, 'useAs']);
    });

    // ─── Staff Management — per-action permissions ──────────────────────────────
    Route::prefix('admin/staff')->middleware(['auth:sanctum', 'staff.token'])->group(function () {
        Route::get('/', [App\Http\Controllers\Api\StaffController::class, 'index'])->middleware('permission:staff.view');
        Route::post('/', [App\Http\Controllers\Api\StaffController::class, 'store'])->middleware('permission:staff.create');
        Route::patch('/{id}', [App\Http\Controllers\Api\StaffController::class, 'update'])->middleware('permission:staff.update');
        Route::post('/{id}/pin', [App\Http\Controllers\Api\StaffController::class, 'resetPin'])->middleware('permission:staff.update');
        Route::delete('/{id}', [App\Http\Controllers\Api\StaffController::class, 'destroy'])->middleware('permission:staff.delete');
    });

    // Staff Scheduling (admin)
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:staff.schedule'])->prefix('admin/schedules')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\ScheduleController::class, 'index']);
        Route::post('/', [App\Http\Controllers\Api\ScheduleController::class, 'store']);
        Route::patch('/{id}', [App\Http\Controllers\Api\ScheduleController::class, 'update']);
        Route::delete('/{id}', [App\Http\Controllers\Api\ScheduleController::class, 'destroy']);
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
            ->middleware('permission.any:staff.view,pos.time_clock');
        Route::get('/time-clock/summary', [App\Http\Controllers\Api\TimeClockController::class, 'summary'])
            ->middleware('permission:staff.view');
    });

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
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:website.manage'])->group(function () {
        Route::get('/site-settings', [App\Http\Controllers\Api\SiteSettingsController::class, 'index']);

        Route::get('/admin/business-details', [App\Http\Controllers\Api\BusinessDetailsController::class, 'show']);
        Route::put('/admin/business-details', [App\Http\Controllers\Api\BusinessDetailsController::class, 'update']);

        Route::get('/admin/content', [App\Http\Controllers\Api\ContentController::class, 'index']);
        Route::put('/admin/content', [App\Http\Controllers\Api\ContentController::class, 'update']);
        Route::get('/admin/content/integrity', [App\Http\Controllers\Api\ContentController::class, 'integrity']);
        Route::get('/admin/content/drafts', [App\Http\Controllers\Api\ContentController::class, 'drafts']);
        Route::put('/admin/content/drafts', [App\Http\Controllers\Api\ContentController::class, 'saveDrafts']);
        Route::delete('/admin/content/drafts', [App\Http\Controllers\Api\ContentController::class, 'discardDrafts']);
        Route::post('/admin/content/upload', [App\Http\Controllers\Api\ContentController::class, 'upload']);
        Route::post('/admin/content/upload-video', [App\Http\Controllers\Api\ContentController::class, 'uploadVideo']);
        Route::post('/admin/content/preview-token', [App\Http\Controllers\Api\ContentPreviewController::class, 'createToken']);
        Route::get('/admin/content/export', [App\Http\Controllers\Api\ContentController::class, 'export']);
        Route::post('/admin/content/import', [App\Http\Controllers\Api\ContentController::class, 'import']);
        Route::post('/admin/content/schedule', [App\Http\Controllers\Api\ContentController::class, 'schedule']);
        Route::get('/admin/content/schedules', [App\Http\Controllers\Api\ContentController::class, 'schedules']);
        Route::delete('/admin/content/schedules/{id}', [App\Http\Controllers\Api\ContentController::class, 'cancelSchedule']);
        Route::get('/admin/content/{key}/revisions', [App\Http\Controllers\Api\ContentController::class, 'revisions']);
        Route::post('/admin/content/{key}/revisions/{id}/restore', [App\Http\Controllers\Api\ContentController::class, 'restoreRevision']);

        // POS close-shift currency photos (note/coin thumbnails).
        Route::post('/admin/currency-images/{face}', [App\Http\Controllers\Api\CurrencyImageController::class, 'store'])->whereNumber('face');
        Route::delete('/admin/currency-images/{face}', [App\Http\Controllers\Api\CurrencyImageController::class, 'destroy'])->whereNumber('face');

        // Home page builder — layout instances per app (not content keys).
        Route::get('/admin/page-blocks', [App\Http\Controllers\Api\PageBlockController::class, 'index']);
        Route::post('/admin/page-blocks', [App\Http\Controllers\Api\PageBlockController::class, 'store']);
        Route::put('/admin/page-blocks/reorder', [App\Http\Controllers\Api\PageBlockController::class, 'reorder']);
        Route::post('/admin/page-blocks/preview-token', [App\Http\Controllers\Api\PageBlockController::class, 'previewToken']);
        Route::post('/admin/page-blocks/publish', [App\Http\Controllers\Api\PageBlockController::class, 'publish']);
        Route::post('/admin/page-blocks/discard', [App\Http\Controllers\Api\PageBlockController::class, 'discard']);
        Route::put('/admin/page-blocks/{id}', [App\Http\Controllers\Api\PageBlockController::class, 'update']);
        Route::delete('/admin/page-blocks/{id}', [App\Http\Controllers\Api\PageBlockController::class, 'destroy']);
    });

    // ─── Permissions Management (Owner only) ───────────────────────────────────
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:roles_permissions.manage'])->group(function () {
        Route::get('/permissions', [App\Http\Controllers\Api\PermissionController::class, 'index']);
        Route::get('/roles/{slug}/permissions', [App\Http\Controllers\Api\RolePermissionController::class, 'show']);
        Route::put('/roles/{slug}/permissions', [App\Http\Controllers\Api\RolePermissionController::class, 'update']);
        Route::get('/users/{user}/permissions', [App\Http\Controllers\Api\PermissionController::class, 'show']);
        Route::put('/users/{user}/permissions', [App\Http\Controllers\Api\PermissionController::class, 'update']);
    });

    // ─── POS Admin oversight (reports.view) ──────────────────────────────────────
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:reports.view'])->prefix('admin')->group(function () {
        Route::get('/pos/overview', [App\Http\Controllers\Api\PosAdminController::class, 'overview']);
        Route::get('/pos/staff-options', [App\Http\Controllers\Api\PosAdminController::class, 'staffOptions']);
        Route::get('/audit-logs', [App\Http\Controllers\Api\AuditLogController::class, 'index']);
        Route::get('/audit-logs/actions', [App\Http\Controllers\Api\AuditLogController::class, 'actions']);
    });

    // Protected admin health — returns full details for internal monitoring
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:website.manage'])
        ->get('/admin/system/health', [App\Http\Controllers\Api\SystemHealthController::class, 'admin']);

    Route::middleware(['auth:sanctum', 'staff.token', 'permission:website.manage'])
        ->get('/admin/system/health/detailed', [App\Http\Controllers\Api\SystemHealthController::class, 'detailed']);

    Route::middleware(['auth:sanctum', 'staff.token', 'permission:website.manage'])->group(function () {
        Route::post('/admin/system/health/failed-jobs/{uuid}/retry', [App\Http\Controllers\Api\SystemHealthController::class, 'retryFailedJob']);
        Route::delete('/admin/system/health/failed-jobs/{uuid}', [App\Http\Controllers\Api\SystemHealthController::class, 'forgetFailedJob']);
    });

    // LIVE → TEST data/media clone (owner + TEST host only)
    Route::middleware(['auth:sanctum', 'staff.token', 'role:owner'])->group(function () {
        Route::get('/admin/ops/clone-live-to-test', [App\Http\Controllers\Api\CloneLiveToTestController::class, 'status']);
        Route::post('/admin/ops/clone-live-to-test', [App\Http\Controllers\Api\CloneLiveToTestController::class, 'start']);
    });

    Route::middleware(['auth:sanctum', 'staff.token', 'permission:website.manage'])->prefix('admin/pos')->group(function () {
        Route::get('/maintenance-preview', [App\Http\Controllers\Api\PosAdminController::class, 'maintenancePreview']);
        Route::post('/cleanup-stale-tickets', [App\Http\Controllers\Api\PosAdminController::class, 'cleanupStaleTickets']);
    });
}
