<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Finance & Inventory API Routes
|--------------------------------------------------------------------------
| Invoices, Expenses, Finance Reports, Supplier Intelligence,
| Purchase Workflow, Inventory Categories, Unit Conversions, Forecasting.
|
| All routes require auth:sanctum + permission-based middleware (see individual route groups)
*/

// ─── Invoices ──────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:finance.invoices'])->prefix('invoices')->group(function () {
    Route::get('/', [App\Http\Controllers\Api\InvoiceController::class, 'index']);
    Route::post('/', [App\Http\Controllers\Api\InvoiceController::class, 'store']);
    Route::get('/{id}', [App\Http\Controllers\Api\InvoiceController::class, 'show']);
    Route::patch('/{id}', [App\Http\Controllers\Api\InvoiceController::class, 'update']);
    Route::post('/{id}/mark-sent', [App\Http\Controllers\Api\InvoiceController::class, 'markSent']);
    Route::post('/{id}/mark-paid', [App\Http\Controllers\Api\InvoiceController::class, 'markPaid']);
    Route::post('/{id}/void', [App\Http\Controllers\Api\InvoiceController::class, 'voidInvoice']);
    Route::post('/{id}/credit-note', [App\Http\Controllers\Api\InvoiceController::class, 'createCreditNote']);
    Route::get('/{id}/pdf', [App\Http\Controllers\Api\InvoiceController::class, 'generatePdf']);
    Route::post('/{id}/send', [App\Http\Controllers\Api\InvoiceController::class, 'sendToCustomer']);
    Route::post('/from-order/{orderId}', [App\Http\Controllers\Api\InvoiceController::class, 'createFromOrder']);
    Route::post('/from-purchase/{purchaseId}', [App\Http\Controllers\Api\InvoiceController::class, 'createFromPurchase']);
});

// ─── Expenses ──────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:finance.expenses'])->prefix('expenses')->group(function () {
    Route::get('/', [App\Http\Controllers\Api\ExpenseController::class, 'index']);
    Route::post('/', [App\Http\Controllers\Api\ExpenseController::class, 'store']);
    Route::get('/categories', [App\Http\Controllers\Api\ExpenseController::class, 'categories']);
    Route::get('/summary', [App\Http\Controllers\Api\ExpenseController::class, 'summary']);
    Route::get('/{id}', [App\Http\Controllers\Api\ExpenseController::class, 'show']);
    Route::patch('/{id}', [App\Http\Controllers\Api\ExpenseController::class, 'update']);
    Route::delete('/{id}', [App\Http\Controllers\Api\ExpenseController::class, 'destroy']);
    Route::post('/{id}/receipt', [App\Http\Controllers\Api\ExpenseController::class, 'uploadReceipt']);
    Route::post('/{id}/approve', [App\Http\Controllers\Api\ExpenseController::class, 'approve']);
});

// ─── Finance Reports ───────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:reports.financial'])->prefix('reports/finance')->group(function () {
    Route::get('/profit-and-loss', [App\Http\Controllers\Api\FinanceReportController::class, 'profitAndLoss']);
    Route::get('/cash-flow', [App\Http\Controllers\Api\FinanceReportController::class, 'cashFlow']);
    Route::get('/tax', [App\Http\Controllers\Api\FinanceReportController::class, 'taxReport']);
    Route::prefix('gst')->group(function () {
        Route::get('/summary', [App\Http\Controllers\Api\GstReportController::class, 'summary']);
        Route::get('/output-statement', [App\Http\Controllers\Api\GstReportController::class, 'outputStatement']);
        Route::get('/input-statement', [App\Http\Controllers\Api\GstReportController::class, 'inputStatement']);
        Route::get('/ledger', [App\Http\Controllers\Api\GstReportController::class, 'ledger']);
        Route::get('/reconciliation', [App\Http\Controllers\Api\GstReportController::class, 'reconciliation']);
        Route::post('/periods/{period}/lock', [App\Http\Controllers\Api\GstReportController::class, 'lockPeriod']);
        Route::post('/manual-adjustment', [App\Http\Controllers\Api\GstReportController::class, 'manualAdjustment']);
        Route::get('/export/summary.csv', [App\Http\Controllers\Api\GstReportController::class, 'exportSummary']);
        Route::get('/export/output-statement.xlsx', [App\Http\Controllers\Api\GstReportController::class, 'exportOutputXlsx']);
        Route::get('/export/input-statement.xlsx', [App\Http\Controllers\Api\GstReportController::class, 'exportInputXlsx']);
        Route::get('/export/ledger.csv', [App\Http\Controllers\Api\GstReportController::class, 'exportLedger']);
    });
    Route::get('/daily-summary', [App\Http\Controllers\Api\FinanceReportController::class, 'dailySummary']);
    Route::get('/spend-hub', [App\Http\Controllers\Api\FinanceReportController::class, 'spendHub']);
    Route::get('/accounts-payable', [App\Http\Controllers\Api\FinanceReportController::class, 'accountsPayable']);
    Route::get('/accounts-receivable', [App\Http\Controllers\Api\FinanceReportController::class, 'accountsReceivable']);
});

// ─── Supplier Intelligence ─────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:suppliers.manage'])->prefix('suppliers')->group(function () {
    // Static routes MUST come before parameterised /{id} routes
    Route::get('/performance', [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'allPerformance']);
    Route::get('/price-comparison/{itemId}', [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'priceComparison']);
    Route::post('/{id}/ratings', [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'rate']);
    Route::get('/{id}/ratings', [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'ratings']);
    Route::get('/{id}/performance', [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'performance']);
    Route::post('/{id}/performance/refresh', [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'refreshCache']);
    Route::get('/{id}/price-history/{itemId}', [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'priceHistory']);
});

// ─── Purchase Workflow ─────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:suppliers.purchases'])->prefix('purchases')->group(function () {
    Route::get('/suggest', [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'autoSuggest']);
    Route::post('/from-suggest', [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'createFromSuggest']);
    Route::post('/{id}/approve', [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'approve'])->whereNumber('id');
    Route::post('/{id}/reject', [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'reject'])->whereNumber('id');
    Route::post('/{id}/receive', [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'receive'])->whereNumber('id');
});

// ─── Inventory Categories & Unit Conversions ───────────────────────────────
Route::middleware(['auth:sanctum', 'permission:inventory.categories'])->prefix('inventory-categories')->group(function () {
    Route::get('/', [App\Http\Controllers\Api\InventoryConfigController::class, 'indexCategories']);
    Route::post('/', [App\Http\Controllers\Api\InventoryConfigController::class, 'storeCategory']);
    Route::patch('/{id}', [App\Http\Controllers\Api\InventoryConfigController::class, 'updateCategory']);
});

Route::middleware(['auth:sanctum', 'permission:inventory.manage'])->prefix('unit-conversions')->group(function () {
    Route::get('/', [App\Http\Controllers\Api\InventoryConfigController::class, 'indexConversions']);
    Route::post('/', [App\Http\Controllers\Api\InventoryConfigController::class, 'storeConversion']);
    Route::delete('/{id}', [App\Http\Controllers\Api\InventoryConfigController::class, 'destroyConversion']);
});

// ─── Forecasting ───────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'permission:reports.financial'])->prefix('forecasts')->group(function () {
    Route::get('/revenue', [App\Http\Controllers\Api\ForecastController::class, 'revenueForecast']);
    Route::get('/items', [App\Http\Controllers\Api\ForecastController::class, 'itemForecast']);
    Route::get('/trends', [App\Http\Controllers\Api\ForecastController::class, 'salesTrends']);
    Route::get('/inventory', [App\Http\Controllers\Api\ForecastController::class, 'inventoryForecast']);
    Route::get('/restock', [App\Http\Controllers\Api\ForecastController::class, 'restockIntelligence']);
});
