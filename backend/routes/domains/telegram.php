<?php

declare(strict_types=1);

use App\Http\Controllers\Api\TelegramAdminController;
use Illuminate\Support\Facades\Route;

/*
| Admin → Telegram (owner, 2026-10-06; docs/TELEGRAM_BOTS.md). Owner-only by
| default (telegram.manage). The webhook Telegram calls is in routes/api.php,
| outside the staff-token group, guarded by each bot's secret.
*/

Route::middleware('permission:telegram.manage')->prefix('admin/telegram')->group(function () {
    Route::get('/', [TelegramAdminController::class, 'index']);
    Route::post('/bots', [TelegramAdminController::class, 'storeBot'])->middleware('throttle:20,1');
    Route::patch('/bots/{id}', [TelegramAdminController::class, 'updateBot'])->whereNumber('id');
    Route::post('/bots/{id}/check', [TelegramAdminController::class, 'checkBot'])->whereNumber('id')->middleware('throttle:30,1');
    Route::post('/bots/{id}/reconnect', [TelegramAdminController::class, 'reconnectBot'])->whereNumber('id')->middleware('throttle:20,1');
    Route::delete('/bots/{id}', [TelegramAdminController::class, 'destroyBot'])->whereNumber('id');
    Route::post('/links/code', [TelegramAdminController::class, 'linkCode'])->middleware('throttle:60,1');
    Route::post('/links/{id}/test', [TelegramAdminController::class, 'testLink'])->whereNumber('id')->middleware('throttle:30,1');
    Route::delete('/links/{id}', [TelegramAdminController::class, 'unlink'])->whereNumber('id');
    Route::put('/settings', [TelegramAdminController::class, 'updateSettings']);
});
