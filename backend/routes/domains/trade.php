<?php

declare(strict_types=1);

use App\Http\Controllers\Api\TradeAccountController;
use App\Http\Controllers\Api\TradeDeliveryController;
use App\Http\Controllers\Api\TradeInvoiceController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Wholesale trade accounts, prices, dispatch, reconciliation & invoicing
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
        Route::get('/{id}/exposure', [TradeDeliveryController::class, 'exposure'])->whereNumber('id');
        Route::get('/{id}/ready-to-invoice', [TradeInvoiceController::class, 'readyToInvoice'])->whereNumber('id');
        Route::get('/{id}/statement', [TradeInvoiceController::class, 'statement'])->whereNumber('id');
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

    Route::middleware('permission:trade.invoice')->group(function () {
        Route::post('/{id}/invoices/preview', [TradeInvoiceController::class, 'preview'])->whereNumber('id');
        Route::post('/{id}/invoices', [TradeInvoiceController::class, 'store'])->whereNumber('id');
    });

    Route::middleware('permission:customers.credit.repay')->group(function () {
        Route::post('/{id}/payments', [TradeInvoiceController::class, 'recordPayment'])->whereNumber('id');
    });
});

Route::middleware(['auth:sanctum', 'staff.token'])->prefix('admin/trade-invoices')->group(function () {
    Route::middleware('permission:trade.invoice')->group(function () {
        Route::post('/{id}/credit-note', [TradeInvoiceController::class, 'creditNote'])->whereNumber('id');
    });
});

Route::middleware(['auth:sanctum', 'staff.token'])->prefix('trade/deliveries')->group(function () {
    Route::middleware('permission:trade.view')->group(function () {
        Route::get('/', [TradeDeliveryController::class, 'index']);
        Route::get('/{id}', [TradeDeliveryController::class, 'show'])->whereNumber('id');
    });

    Route::middleware('permission:trade.dispatch')->group(function () {
        Route::post('/dispatch', [TradeDeliveryController::class, 'dispatch']);
        Route::post('/{id}/cancel', [TradeDeliveryController::class, 'cancel'])->whereNumber('id');
    });

    Route::middleware('permission:trade.reconcile')->group(function () {
        Route::post('/{id}/reconcile', [TradeDeliveryController::class, 'reconcile'])->whereNumber('id');
    });

    Route::middleware('permission:trade.invoice')->group(function () {
        Route::post('/{id}/resolve-mismatch', [TradeInvoiceController::class, 'resolveMismatch'])->whereNumber('id');
        Route::post('/{id}/waive-missing', [TradeInvoiceController::class, 'waiveMissing'])->whereNumber('id');
    });
});
