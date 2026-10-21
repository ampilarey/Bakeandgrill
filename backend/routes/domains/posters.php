<?php

declare(strict_types=1);

use App\Http\Controllers\Api\PosterController;
use App\Http\Controllers\Api\PosterEverywhereController;
use App\Http\Controllers\Api\PosterShopController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'staff.token', 'permission:posters.make'])
    ->prefix('posters')
    ->group(function () {
        Route::get('/catalog', [PosterController::class, 'catalog']);
        Route::get('/lookups', [PosterController::class, 'lookups']);
        Route::post('/preview', [PosterController::class, 'preview']);
        Route::post('/photo', [PosterController::class, 'uploadPhoto']);
        Route::get('/templates', [PosterController::class, 'templates']);
        Route::post('/templates', [PosterController::class, 'storeTemplate']);
        Route::put('/templates/{template}', [PosterController::class, 'updateTemplate']);
        Route::delete('/templates/{template}', [PosterController::class, 'destroyTemplate']);
        Route::get('/', [PosterController::class, 'index']);
        Route::post('/', [PosterController::class, 'store']);
        Route::get('/shops', [PosterShopController::class, 'shops']);
        Route::post('/shops', [PosterShopController::class, 'storeShop']);
        Route::put('/shops/{supplier}', [PosterShopController::class, 'updateShop']);
        Route::put('/proof-approval', [PosterShopController::class, 'setProofApproval']);
        Route::get('/orders', [PosterShopController::class, 'orders']);
        Route::post('/orders/{order}/quote', [PosterShopController::class, 'quote']);
        Route::post('/orders/{order}/approve-quote', [PosterShopController::class, 'approveQuote']);
        Route::post('/orders/{order}/state', [PosterShopController::class, 'advance']);
        Route::get('/exports/{export}', [PosterController::class, 'exportStatus']);
        Route::get('/exports/{export}/download', [PosterController::class, 'download']);
        // The ready-made designs: one theme's slots, and its preview, backdrop and placeholder files
        // (the admin's <img> tags carry the session cookie, so these stay behind the sign-in).
        Route::get('/themes/{key}', [PosterController::class, 'theme'])->where('key', '[a-z0-9-]+');
        Route::get('/themes/{key}/{file}', [PosterController::class, 'themeFile'])->where(['key' => '[a-z0-9-]+', 'file' => '[A-Za-z0-9._-]+']);
        // A photo uploaded for posters, for the on-screen preview of a template's photo slot.
        Route::get('/photo/{name}', [PosterController::class, 'photo'])->where('name', '[a-f0-9]{24}\.jpg');
        Route::post('/{poster}/orders', [PosterShopController::class, 'send']);
        Route::post('/{poster}/tv', [PosterEverywhereController::class, 'tv']);
        Route::post('/{poster}/social', [PosterEverywhereController::class, 'social']);
        Route::post('/{poster}/banner', [PosterEverywhereController::class, 'banner']);
        Route::get('/{poster}', [PosterController::class, 'show']);
        Route::put('/{poster}', [PosterController::class, 'update']);
        Route::delete('/{poster}', [PosterController::class, 'destroy']);
        Route::post('/{poster}/duplicate', [PosterController::class, 'duplicate']);
        Route::post('/{poster}/export', [PosterController::class, 'export']);
    });
