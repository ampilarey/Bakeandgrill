<?php

declare(strict_types=1);

require __DIR__ . '/_helpers.php';

use App\Http\Controllers\Api\Auth\DeviceController;
use App\Http\Controllers\Api\PrintJobController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Device management, print jobs, and real-time streams
|--------------------------------------------------------------------------
| Staff device routes: loaded inside auth:sanctum + staff.token group.
| Stream routes: loaded at top level.
*/

if (routes_domain_section_is_or_unset('devices', 'staff', 'staff') && !routes_domain_loaded('devices.staff')) {
    routes_domain_mark_loaded('devices.staff');

    Route::prefix('devices')->group(function () {
        Route::get('/', [DeviceController::class, 'index'])->middleware('permission:devices.view');
        Route::get('/pending', [DeviceController::class, 'pending'])->middleware('permission:devices.view');
        Route::post('/register', [DeviceController::class, 'register'])
            ->middleware(['permission:devices.manage', 'throttle:10,1']);
        Route::patch('/{id}', [DeviceController::class, 'update'])->middleware('permission:devices.manage');
        Route::patch('/{id}/approve', [DeviceController::class, 'approve'])->middleware('permission:devices.approve');
        Route::patch('/{id}/reject', [DeviceController::class, 'reject'])->middleware('permission:devices.approve');
        Route::patch('/{id}/disable', [DeviceController::class, 'disable'])->middleware('permission:devices.manage');
        Route::patch('/{id}/enable', [DeviceController::class, 'enable'])->middleware('permission:devices.manage');
        Route::delete('/{id}', [DeviceController::class, 'destroy'])->middleware('permission:devices.manage');
    });

    Route::post('/devices/self-register', [DeviceController::class, 'selfRegister'])->middleware('throttle:10,1');
    Route::get('/devices/self-status', [DeviceController::class, 'selfStatus']);

    Route::get('/print-jobs', [PrintJobController::class, 'index'])->middleware('permission:devices.view');
    Route::post('/print-jobs/{id}/retry', [PrintJobController::class, 'retry'])->middleware('permission:devices.manage');
}

if (routes_domain_section_is('devices', 'streams') && !routes_domain_loaded('devices.streams')) {
    routes_domain_mark_loaded('devices.streams');

    Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
        Route::get('/stream/orders', [App\Http\Controllers\Api\StreamController::class, 'orders'])
            ->middleware('permission:orders.view');
        Route::get('/stream/kds', [App\Http\Controllers\Api\StreamController::class, 'kds'])
            ->middleware('permission:kds.view');
        Route::get('/stream/orders/{order}/status', [App\Http\Controllers\Api\StreamController::class, 'orderStatus'])
            ->middleware('permission:orders.view');
    });

    Route::middleware(['auth:sanctum', 'customer.token'])->post(
        '/orders/{orderId}/stream-ticket',
        [App\Http\Controllers\Api\StreamController::class, 'issueStreamTicket'],
    );

    Route::get('/stream/order-status/{orderId}', [App\Http\Controllers\Api\StreamController::class, 'publicOrderStatus'])
        ->middleware('throttle:30,1');
}
