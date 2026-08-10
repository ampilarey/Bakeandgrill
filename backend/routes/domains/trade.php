<?php

declare(strict_types=1);

use App\Http\Controllers\Api\TradeAccountController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Wholesale trade accounts & price lists (Stage A)
|--------------------------------------------------------------------------
| Loaded inside auth:sanctum + staff.token. Owner-only by default via
| trade.* permissions (excluded from managerSlugs).
*/

Route::middleware(['auth:sanctum', 'staff.token'])->prefix('admin/trade-accounts')->group(function () {
    Route::middleware('permission:trade.view')->group(function () {
        Route::get('/', [TradeAccountController::class, 'index']);
        Route::get('/{id}', [TradeAccountController::class, 'show'])->whereNumber('id');
        Route::get('/{id}/prices', [TradeAccountController::class, 'priceIndex'])->whereNumber('id');
        Route::get('/{id}/resolved-prices', [TradeAccountController::class, 'resolvedPrices'])->whereNumber('id');
        Route::get('/{id}/price-preview', [TradeAccountController::class, 'pricePreview'])->whereNumber('id');
    });

    Route::middleware('permission:trade.manage_accounts')->group(function () {
        Route::post('/', [TradeAccountController::class, 'store']);
        Route::put('/{id}', [TradeAccountController::class, 'update'])->whereNumber('id');
        Route::patch('/{id}', [TradeAccountController::class, 'update'])->whereNumber('id');
        Route::post('/{id}/deactivate', [TradeAccountController::class, 'deactivate'])->whereNumber('id');
    });

    Route::middleware('permission:trade.manage_prices')->group(function () {
        Route::post('/{id}/prices', [TradeAccountController::class, 'priceStore'])->whereNumber('id');
        Route::put('/{id}/prices/{entryId}', [TradeAccountController::class, 'priceUpdate'])
            ->whereNumber('id')->whereNumber('entryId');
        Route::patch('/{id}/prices/{entryId}', [TradeAccountController::class, 'priceUpdate'])
            ->whereNumber('id')->whereNumber('entryId');
        Route::delete('/{id}/prices/{entryId}', [TradeAccountController::class, 'priceDestroy'])
            ->whereNumber('id')->whereNumber('entryId');
    });
});
