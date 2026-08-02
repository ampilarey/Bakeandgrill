<?php

declare(strict_types=1);

use App\Http\Controllers\Api\Signage\PublicSignageController;
use App\Http\Controllers\Api\Signage\SignageAdminController;
use App\Http\Controllers\Api\Signage\SignageDeviceController;
use Illuminate\Support\Facades\Route;

// Public TV board config + device heartbeat
Route::middleware('throttle:120,1')->group(function () {
    Route::get('/signage/{screen?}', [PublicSignageController::class, 'show'])
        ->where('screen', '[A-Za-z0-9_-]+');
    Route::post('/signage/heartbeat', [SignageDeviceController::class, 'heartbeat']);
});

Route::middleware(['auth:sanctum', 'staff.token', 'permission:signage.manage'])
    ->prefix('admin/signage')
    ->group(function () {
        Route::get('/', [SignageAdminController::class, 'overview']);

        Route::post('/playlists', [SignageAdminController::class, 'storePlaylist']);
        Route::put('/playlists/{id}', [SignageAdminController::class, 'updatePlaylist']);
        Route::delete('/playlists/{id}', [SignageAdminController::class, 'destroyPlaylist']);

        Route::post('/groups', [SignageAdminController::class, 'storeGroup']);
        Route::put('/groups/{id}', [SignageAdminController::class, 'updateGroup']);
        Route::delete('/groups/{id}', [SignageAdminController::class, 'destroyGroup']);

        Route::post('/screens', [SignageAdminController::class, 'storeScreen']);
        Route::put('/screens/{id}', [SignageAdminController::class, 'updateScreen']);
        Route::delete('/screens/{id}', [SignageAdminController::class, 'destroyScreen']);

        Route::post('/campaigns', [SignageAdminController::class, 'storeCampaign']);
        Route::put('/campaigns/{id}', [SignageAdminController::class, 'updateCampaign']);
        Route::delete('/campaigns/{id}', [SignageAdminController::class, 'destroyCampaign']);

        Route::put('/emergency', [SignageAdminController::class, 'updateEmergency']);
        Route::put('/prayer', [SignageAdminController::class, 'updatePrayer']);
        Route::put('/banner', [SignageAdminController::class, 'updateBanner']);
        Route::post('/templates', [SignageAdminController::class, 'saveCustomTemplate']);
        Route::post('/templates/build', [SignageAdminController::class, 'buildTemplate']);

        Route::get('/devices', [SignageDeviceController::class, 'index']);
        Route::post('/devices/{device}/approve', [SignageDeviceController::class, 'approve']);
        Route::post('/devices/{device}/command', [SignageDeviceController::class, 'command']);
    });
