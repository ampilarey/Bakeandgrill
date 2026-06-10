<?php

declare(strict_types=1);

require __DIR__ . '/_helpers.php';

use App\Http\Controllers\Api\KdsController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Kitchen display, production, receiving, and operational reports
|--------------------------------------------------------------------------
| KDS block: loaded inside auth:sanctum + staff.token group.
| Production block: loaded inside staff group after inventory routes.
| Wait time: loaded at top level (public section).
*/

if (routes_domain_section_is_or_unset('kitchen', 'kds', 'kds') && !routes_domain_loaded('kitchen.kds')) {
    routes_domain_mark_loaded('kitchen.kds');

    // KDS — list endpoint stays unauthenticated by device (any approved
    // staff token can pull the kitchen queue read-only). Mutations
    // (start/bump/recall) require an approved device header so a stolen
    // staff token alone can't progress the queue from an off-prem
    // browser.
    Route::get('/kds/orders', [KdsController::class, 'index'])->middleware('permission:kds.view');
    Route::get('/kds/menu-groups', [KdsController::class, 'menuGroups'])->middleware('permission:kds.view');
    Route::post('/kds/items/{id}/86', [KdsController::class, 'toggleItemAvailability'])
        ->middleware('permission:kds.manage_availability');
    Route::post('/kds/orders/{id}/start', [KdsController::class, 'start'])
        ->middleware(['permission:kds.start_order', 'device.active']);
    Route::post('/kds/orders/{id}/kitchen-done', [KdsController::class, 'kitchenDone'])
        ->middleware(['permission:kds.mark_kitchen_done', 'device.active']);
    Route::post('/kds/orders/{orderId}/items/{orderItemId}/cooked', [KdsController::class, 'markItemCooked'])
        ->middleware(['permission:kitchen.production.create', 'device.active']);
    Route::post('/kds/orders/{id}/print-ticket', [KdsController::class, 'printTicket'])
        ->middleware(['permission:kds.print_ticket', 'device.active']);
    Route::post('/kds/orders/{id}/bump', [KdsController::class, 'bump'])
        ->middleware(['permission:kds.bump_order', 'device.active']);
    Route::post('/kds/orders/{id}/recall', [KdsController::class, 'recall'])
        ->middleware(['permission:kds.recall_order', 'device.active']);
}

if (routes_domain_section_is('kitchen', 'production') && !routes_domain_loaded('kitchen.production')) {
    routes_domain_mark_loaded('kitchen.production');

    // Kitchen production & receiving
    Route::get('/kitchen-handover/settings', [App\Http\Controllers\Api\KitchenReceivingController::class, 'settings'])
        ->middleware('permission:kitchen.receiving.view');
    Route::put('/kitchen-handover/settings', [App\Http\Controllers\Api\KitchenVarianceController::class, 'updateSettings'])
        ->middleware('permission:kitchen.production.manage');

    Route::get('/kitchen-production', [App\Http\Controllers\Api\KitchenProductionController::class, 'index'])
        ->middleware('permission:kitchen.production.view_own');
    Route::post('/kitchen-production', [App\Http\Controllers\Api\KitchenProductionController::class, 'store'])
        ->middleware('permission:kitchen.production.create');
    Route::get('/kitchen-production/{id}', [App\Http\Controllers\Api\KitchenProductionController::class, 'show']);
    Route::post('/kitchen-production/{id}/submit', [App\Http\Controllers\Api\KitchenProductionController::class, 'submit'])
        ->middleware('permission:kitchen.production.submit');
    Route::post('/kitchen-production/{id}/cancel', [App\Http\Controllers\Api\KitchenProductionController::class, 'cancel']);
    Route::post('/kitchen-production/{id}/items/{itemId}/waste', [App\Http\Controllers\Api\KitchenProductionController::class, 'recordWaste'])
        ->middleware('permission:kitchen.production.record_waste');
    Route::post('/kitchen-production/{id}/items/{itemId}/remake', [App\Http\Controllers\Api\KitchenProductionController::class, 'recordRemake'])
        ->middleware('permission:kitchen.production.record_remake');
    Route::post('/kitchen-production/{id}/attachments', [App\Http\Controllers\Api\KitchenProductionController::class, 'uploadAttachment'])
        ->middleware('permission:kitchen.production.attach_photo');

    Route::get('/kitchen-receiving/pending', [App\Http\Controllers\Api\KitchenReceivingController::class, 'pending'])
        ->middleware('permission:kitchen.receiving.view');
    Route::get('/kitchen-receiving/orders/{orderId}', [App\Http\Controllers\Api\KitchenReceivingController::class, 'forOrder'])
        ->middleware('permission:kitchen.receiving.view');
    Route::post('/kitchen-receiving/{productionBatchId}/receive-all', [App\Http\Controllers\Api\KitchenReceivingController::class, 'receiveAll'])
        ->middleware('permission:kitchen.receiving.receive');
    Route::post('/kitchen-receiving/{productionBatchId}/items/{itemId}/receive', [App\Http\Controllers\Api\KitchenReceivingController::class, 'receiveItem'])
        ->middleware('permission:kitchen.receiving.receive');
    Route::post('/kitchen-receiving/{productionBatchId}/items/{itemId}/reject', [App\Http\Controllers\Api\KitchenReceivingController::class, 'rejectItem'])
        ->middleware('permission:kitchen.receiving.reject');
    Route::post('/kitchen-receiving/{productionBatchId}/items/{itemId}/request-remake', [App\Http\Controllers\Api\KitchenReceivingController::class, 'requestRemake'])
        ->middleware('permission:kitchen.receiving.request_remake');
    Route::post('/kitchen-receiving/{productionBatchId}/attachments', [App\Http\Controllers\Api\KitchenReceivingController::class, 'uploadAttachment'])
        ->middleware('permission:kitchen.receiving.attach_photo');

    Route::get('/kitchen-variance', [App\Http\Controllers\Api\KitchenVarianceController::class, 'index'])
        ->middleware('permission:kitchen.variance.review');
    Route::post('/kitchen-variance/{id}/review', [App\Http\Controllers\Api\KitchenVarianceController::class, 'review'])
        ->middleware('permission:kitchen.variance.review');

    Route::get('/kitchen-reports/summary', [App\Http\Controllers\Api\KitchenProductionReportController::class, 'productionSummary'])
        ->middleware('permission:kitchen.production.reports');
    Route::get('/kitchen-reports/handover', [App\Http\Controllers\Api\KitchenProductionReportController::class, 'handoverReport'])
        ->middleware('permission:kitchen.production.reports');
    Route::get('/kitchen-reports/waste', [App\Http\Controllers\Api\KitchenProductionReportController::class, 'wasteReport'])
        ->middleware('permission:kitchen.production.reports');
    Route::get('/kitchen-reports/staff-output', [App\Http\Controllers\Api\KitchenProductionReportController::class, 'staffOutput'])
        ->middleware('permission:kitchen.production.reports');
    Route::get('/kitchen-reports/pos-receiving', [App\Http\Controllers\Api\KitchenProductionReportController::class, 'posReceivingReport'])
        ->middleware('permission:kitchen.production.reports');
}

if (routes_domain_section_is('kitchen', 'wait_time') && !routes_domain_loaded('kitchen.wait_time')) {
    routes_domain_mark_loaded('kitchen.wait_time');

    // Public wait time estimate
    Route::get('/wait-time', [App\Http\Controllers\Api\WaitTimeController::class, 'estimate']);
}
