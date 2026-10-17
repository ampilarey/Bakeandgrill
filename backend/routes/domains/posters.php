<?php

declare(strict_types=1);

use App\Http\Controllers\Api\PosterController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'staff.token', 'permission:posters.make'])
    ->prefix('posters')
    ->group(function () {
        Route::get('/catalog', [PosterController::class, 'catalog']);
        Route::get('/lookups', [PosterController::class, 'lookups']);
        Route::post('/preview', [PosterController::class, 'preview']);
        Route::get('/templates', [PosterController::class, 'templates']);
        Route::post('/templates', [PosterController::class, 'storeTemplate']);
        Route::put('/templates/{template}', [PosterController::class, 'updateTemplate']);
        Route::delete('/templates/{template}', [PosterController::class, 'destroyTemplate']);
        Route::get('/', [PosterController::class, 'index']);
        Route::post('/', [PosterController::class, 'store']);
        Route::get('/exports/{export}/download', [PosterController::class, 'download']);
        Route::get('/{poster}', [PosterController::class, 'show']);
        Route::put('/{poster}', [PosterController::class, 'update']);
        Route::delete('/{poster}', [PosterController::class, 'destroy']);
        Route::post('/{poster}/duplicate', [PosterController::class, 'duplicate']);
        Route::post('/{poster}/export', [PosterController::class, 'export']);
    });
