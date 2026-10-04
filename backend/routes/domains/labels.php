<?php

declare(strict_types=1);

use App\Http\Controllers\Api\LabelsController;
use Illuminate\Support\Facades\Route;

/*
| Label Hub (owner, 2026-10-04; docs/LABEL_HUB_PLAN.md). Owner-only by default;
| the owner grants labels.print / labels.manage to any role or staff member.
*/

Route::get('/labels/products', [LabelsController::class, 'products'])
    ->middleware('permission:labels.print');
Route::get('/labels/items/{item}', [LabelsController::class, 'show'])
    ->middleware('permission:labels.print')
    ->whereNumber('item');
Route::put('/items/{item}/label', [LabelsController::class, 'updateItem'])
    ->middleware('permission:labels.manage')
    ->whereNumber('item');
Route::get('/labels/layouts', [LabelsController::class, 'layouts'])
    ->middleware('permission:labels.print');
Route::post('/labels/stickers/url', [LabelsController::class, 'stickersUrl'])
    ->middleware(['permission:labels.print', 'throttle:60,1']);
Route::get('/labels/prints', [LabelsController::class, 'prints'])
    ->middleware('permission:labels.print');
Route::get('/labels/settings', [LabelsController::class, 'settings'])
    ->middleware('permission:labels.print');
Route::put('/labels/settings', [LabelsController::class, 'updateSettings'])
    ->middleware('permission:labels.manage');
Route::post('/labels/box/url', [LabelsController::class, 'boxUrl'])
    ->middleware(['permission:labels.print', 'throttle:60,1']);
Route::get('/labels/deliveries/{delivery}/box-label', [LabelsController::class, 'deliveryBoxLabel'])
    ->middleware('permission:labels.print')
    ->whereNumber('delivery');
Route::get('/labels/shops', [LabelsController::class, 'shops'])
    ->middleware('permission:labels.print');
Route::get('/labels/shops/{tradeAccount}/box-label', [LabelsController::class, 'shopBoxLabel'])
    ->middleware('permission:labels.print')
    ->whereNumber('tradeAccount');
Route::put('/labels/shops/{tradeAccount}/box-label', [LabelsController::class, 'saveShopBoxLabel'])
    ->middleware('permission:labels.print')
    ->whereNumber('tradeAccount');
Route::get('/labels/production-items/{productionItem}', [LabelsController::class, 'productionStickers'])
    ->middleware('permission:labels.print')
    ->whereNumber('productionItem');
