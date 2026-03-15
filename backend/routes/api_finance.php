<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Finance & Inventory API Routes
|--------------------------------------------------------------------------
| Invoices, Expenses, Finance Reports, Supplier Intelligence,
| Purchase Workflow, Inventory Categories, Unit Conversions, Forecasting.
|
| All routes require auth:sanctum + role:manager,owner
*/

// ─── Invoices ──────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,owner'])->prefix('invoices')->group(function () {
    Route::get('/',                           [App\Http\Controllers\Api\InvoiceController::class, 'index']);
    Route::post('/',                          [App\Http\Controllers\Api\InvoiceController::class, 'store']);
    Route::get('/{id}',                       [App\Http\Controllers\Api\InvoiceController::class, 'show']);
    Route::patch('/{id}',                     [App\Http\Controllers\Api\InvoiceController::class, 'update']);
    Route::post('/{id}/mark-sent',            [App\Http\Controllers\Api\InvoiceController::class, 'markSent']);
    Route::post('/{id}/mark-paid',            [App\Http\Controllers\Api\InvoiceController::class, 'markPaid']);
    Route::post('/{id}/void',                 [App\Http\Controllers\Api\InvoiceController::class, 'voidInvoice']);
    Route::post('/{id}/credit-note',          [App\Http\Controllers\Api\InvoiceController::class, 'createCreditNote']);
    Route::get('/{id}/pdf',                   [App\Http\Controllers\Api\InvoiceController::class, 'generatePdf']);
    Route::post('/from-order/{orderId}',      [App\Http\Controllers\Api\InvoiceController::class, 'createFromOrder']);
    Route::post('/from-purchase/{purchaseId}',[App\Http\Controllers\Api\InvoiceController::class, 'createFromPurchase']);
});

// ─── Expenses ──────────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,owner'])->prefix('expenses')->group(function () {
    Route::get('/',                [App\Http\Controllers\Api\ExpenseController::class, 'index']);
    Route::post('/',               [App\Http\Controllers\Api\ExpenseController::class, 'store']);
    Route::get('/categories',      [App\Http\Controllers\Api\ExpenseController::class, 'categories']);
    Route::get('/summary',         [App\Http\Controllers\Api\ExpenseController::class, 'summary']);
    Route::get('/{id}',            [App\Http\Controllers\Api\ExpenseController::class, 'show']);
    Route::patch('/{id}',          [App\Http\Controllers\Api\ExpenseController::class, 'update']);
    Route::delete('/{id}',         [App\Http\Controllers\Api\ExpenseController::class, 'destroy']);
    Route::post('/{id}/receipt',   [App\Http\Controllers\Api\ExpenseController::class, 'uploadReceipt']);
    Route::post('/{id}/approve',   [App\Http\Controllers\Api\ExpenseController::class, 'approve']);
});

// ─── Finance Reports ───────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,owner'])->prefix('reports/finance')->group(function () {
    Route::get('/profit-and-loss',    [App\Http\Controllers\Api\FinanceReportController::class, 'profitAndLoss']);
    Route::get('/cash-flow',          [App\Http\Controllers\Api\FinanceReportController::class, 'cashFlow']);
    Route::get('/tax',                [App\Http\Controllers\Api\FinanceReportController::class, 'taxReport']);
    Route::get('/daily-summary',      [App\Http\Controllers\Api\FinanceReportController::class, 'dailySummary']);
    Route::get('/accounts-payable',   [App\Http\Controllers\Api\FinanceReportController::class, 'accountsPayable']);
    Route::get('/accounts-receivable',[App\Http\Controllers\Api\FinanceReportController::class, 'accountsReceivable']);
});

// ─── Supplier Intelligence ─────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,owner'])->prefix('suppliers')->group(function () {
    // Static routes MUST come before parameterised /{id} routes
    Route::get('/performance',                 [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'allPerformance']);
    Route::get('/price-comparison/{itemId}',   [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'priceComparison']);
    Route::post('/{id}/ratings',               [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'rate']);
    Route::get('/{id}/ratings',                [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'ratings']);
    Route::get('/{id}/performance',            [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'performance']);
    Route::post('/{id}/performance/refresh',   [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'refreshCache']);
    Route::get('/{id}/price-history/{itemId}', [App\Http\Controllers\Api\SupplierIntelligenceController::class, 'priceHistory']);
});

// ─── Purchase Workflow ─────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,owner'])->prefix('purchases')->group(function () {
    Route::post('/{id}/approve',  [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'approve']);
    Route::post('/{id}/reject',   [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'reject']);
    Route::post('/{id}/receive',  [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'receive']);
    Route::get('/suggest',        [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'autoSuggest']);
    Route::post('/from-suggest',  [App\Http\Controllers\Api\PurchaseWorkflowController::class, 'createFromSuggest']);
});

// ─── Inventory Categories & Unit Conversions ───────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,owner'])->prefix('inventory-categories')->group(function () {
    Route::get('/',       fn() => response()->json(['categories' => \App\Models\InventoryCategory::orderBy('name')->get()]));
    Route::post('/',      function (Illuminate\Http\Request $req) {
        $validated = $req->validate(['name' => 'required|string|max:100', 'description' => 'nullable|string']);
        $cat = \App\Models\InventoryCategory::create([...$validated, 'slug' => \Illuminate\Support\Str::slug($validated['name'])]);
        return response()->json(['category' => $cat], 201);
    });
    Route::patch('/{id}', function (Illuminate\Http\Request $req, int $id) {
        $cat = \App\Models\InventoryCategory::findOrFail($id);
        $cat->update($req->validate(['name' => 'sometimes|string|max:100', 'description' => 'nullable|string', 'is_active' => 'sometimes|boolean']));
        return response()->json(['category' => $cat]);
    });
});

Route::middleware(['auth:sanctum', 'role:manager,owner'])->prefix('unit-conversions')->group(function () {
    Route::get('/', fn() => response()->json(['conversions' => \App\Models\UnitConversion::all()]));
    Route::post('/', function (Illuminate\Http\Request $req) {
        $v = $req->validate(['from_unit' => 'required|string|max:20', 'to_unit' => 'required|string|max:20', 'factor' => 'required|numeric|min:0.000001']);
        $uc = \App\Models\UnitConversion::updateOrCreate(['from_unit' => $v['from_unit'], 'to_unit' => $v['to_unit']], ['factor' => $v['factor']]);
        return response()->json(['conversion' => $uc], 201);
    });
});

// ─── Forecasting ───────────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'role:manager,owner'])->prefix('forecasts')->group(function () {
    Route::get('/revenue',   [App\Http\Controllers\Api\ForecastController::class, 'revenueForecast']);
    Route::get('/items',     [App\Http\Controllers\Api\ForecastController::class, 'itemForecast']);
    Route::get('/trends',    [App\Http\Controllers\Api\ForecastController::class, 'salesTrends']);
    Route::get('/inventory', [App\Http\Controllers\Api\ForecastController::class, 'inventoryForecast']);
});
