<?php

declare(strict_types=1);

require __DIR__ . '/_helpers.php';

use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\PurchaseController;
use App\Http\Controllers\Api\SupplierController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Inventory, purchasing, and waste tracking routes
|--------------------------------------------------------------------------
| Staff inventory block: loaded inside auth:sanctum + staff.token group.
| Waste logs: loaded at top level (waste section).
*/

if (routes_domain_section_is_or_unset('inventory', 'staff', 'staff') && !routes_domain_loaded('inventory.staff')) {
    routes_domain_mark_loaded('inventory.staff');

    // Inventory — static paths MUST come before {id} wildcard to avoid shadowing
    Route::middleware('permission:inventory.view')->group(function () {
        Route::get('/inventory', [InventoryController::class, 'index']);
        Route::get('/inventory/low-stock', [InventoryController::class, 'lowStock']);
        Route::get('/inventory/{id}', [InventoryController::class, 'show']);
        Route::get('/inventory/{id}/price-history', [InventoryController::class, 'priceHistory']);
        Route::get('/inventory/{id}/cheapest-supplier', [InventoryController::class, 'cheapestSupplier']);
    });
    Route::post('/inventory', [InventoryController::class, 'store'])->middleware('permission:inventory.manage');
    Route::post('/inventory/stock-count', [InventoryController::class, 'stockCount'])->middleware('permission:inventory.manage');
    Route::patch('/inventory/{id}', [InventoryController::class, 'update'])->middleware('permission:inventory.manage');
    Route::post('/inventory/{id}/adjust', [InventoryController::class, 'adjust'])->middleware('permission:inventory.manage');
    Route::post('/inventory/reorder-alerts/{id}/resolve', [InventoryController::class, 'resolveReorderAlert'])
        ->middleware('permission:inventory.manage')
        ->whereNumber('id');

    Route::middleware('permission:menu.prepared_stock')->group(function () {
        Route::get('/prepared-stock', [App\Http\Controllers\Api\PreparedStockController::class, 'index']);
        Route::post('/items/{id}/prepared-stock/adjust', [App\Http\Controllers\Api\PreparedStockController::class, 'adjust']);
    });

    // Snooze / 86 — admin menu editors (menu.manage) or POS ops (menu.prepared_stock)
    Route::patch('/items/{id}/snooze', [App\Http\Controllers\Api\ItemController::class, 'snooze'])
        ->middleware('permission.any:menu.manage,menu.prepared_stock');

    // Suppliers — read requires suppliers.view, write requires suppliers.manage
    Route::middleware('permission:suppliers.view')->group(function () {
        Route::get('/suppliers', [SupplierController::class, 'index']);
        Route::get('/suppliers/{id}', [SupplierController::class, 'show']);
    });
    Route::middleware('permission:suppliers.manage')->group(function () {
        Route::post('/suppliers', [SupplierController::class, 'store']);
        Route::patch('/suppliers/{id}', [SupplierController::class, 'update']);
        Route::delete('/suppliers/{id}', [SupplierController::class, 'destroy']);
    });

    // Purchases — all operations require suppliers.purchases
    // {id} is numeric so /purchases/suggest (finance domain) is not swallowed.
    Route::middleware('permission:suppliers.purchases')->group(function () {
        Route::get('/purchases', [PurchaseController::class, 'index']);
        Route::post('/purchases', [PurchaseController::class, 'store']);
        Route::post('/purchases/import', [PurchaseController::class, 'import']);
        Route::get('/purchases/{id}', [PurchaseController::class, 'show'])->whereNumber('id');
        Route::patch('/purchases/{id}', [PurchaseController::class, 'update'])->whereNumber('id');
        Route::post('/purchases/{id}/receipts', [PurchaseController::class, 'uploadReceipt'])->whereNumber('id');
    });

    // Purchase Requests — operational buying tasks (staff request, manager verify)
    Route::post('/purchase-requests', [App\Http\Controllers\Api\PurchaseRequestController::class, 'store'])
        ->middleware('permission:purchase_requests.create');
    Route::get('/purchase-requests/my', [App\Http\Controllers\Api\PurchaseRequestController::class, 'my'])
        ->middleware('permission:purchase_requests.view_own');
    Route::get('/purchase-requests/assigned-to-me', [App\Http\Controllers\Api\PurchaseRequestController::class, 'assignedToMe'])
        ->middleware('permission:purchase_requests.view_own');
    Route::get('/purchase-requests/settings/auto-expense', [App\Http\Controllers\Api\PurchaseRequestController::class, 'autoExpenseSettings'])
        ->middleware('permission:purchase_requests.view_all');
    Route::patch('/purchase-requests/settings/auto-expense', [App\Http\Controllers\Api\PurchaseRequestController::class, 'updateAutoExpenseSettings'])
        ->middleware('permission:purchase_requests.convert_to_expense');
    Route::get('/purchase-requests/reconciliation', [App\Http\Controllers\Api\PurchaseRequestController::class, 'reconciliation'])
        ->middleware('permission:purchase_requests.view_all');
    Route::get('/purchase-requests', [App\Http\Controllers\Api\PurchaseRequestController::class, 'index'])
        ->middleware('permission:purchase_requests.view_all');
    Route::get('/purchase-requests/{id}', [App\Http\Controllers\Api\PurchaseRequestController::class, 'show']);
    Route::put('/purchase-requests/{id}', [App\Http\Controllers\Api\PurchaseRequestController::class, 'update'])
        ->middleware('permission:purchase_requests.approve');
    Route::post('/purchase-requests/{id}/approve', [App\Http\Controllers\Api\PurchaseRequestController::class, 'approve'])
        ->middleware('permission:purchase_requests.approve');
    Route::post('/purchase-requests/{id}/reject', [App\Http\Controllers\Api\PurchaseRequestController::class, 'reject'])
        ->middleware('permission:purchase_requests.reject');
    Route::post('/purchase-requests/{id}/assign', [App\Http\Controllers\Api\PurchaseRequestController::class, 'assign'])
        ->middleware('permission:purchase_requests.assign');
    Route::post('/purchase-requests/{id}/cancel', [App\Http\Controllers\Api\PurchaseRequestController::class, 'cancel']);
    Route::post('/purchase-requests/{id}/merge', [App\Http\Controllers\Api\PurchaseRequestController::class, 'merge'])
        ->middleware('permission:purchase_requests.merge');
    Route::post('/purchase-requests/{id}/verify-all', [App\Http\Controllers\Api\PurchaseRequestController::class, 'verifyAll'])
        ->middleware('permission:purchase_requests.verify');
    Route::post('/purchase-requests/{id}/convert-to-purchase', [App\Http\Controllers\Api\PurchaseRequestController::class, 'convertToPurchase'])
        ->middleware('permission:purchase_requests.convert_to_purchase');
    Route::post('/purchase-requests/{id}/convert-to-expense', [App\Http\Controllers\Api\PurchaseRequestController::class, 'convertToExpense'])
        ->middleware('permission:purchase_requests.convert_to_expense');
    Route::post('/purchase-requests/{id}/attachments', [App\Http\Controllers\Api\PurchaseRequestController::class, 'uploadAttachment']);
    Route::post('/purchase-requests/{id}/items/{itemId}/mark-bought', [App\Http\Controllers\Api\PurchaseRequestController::class, 'markBought'])
        ->middleware('permission:purchase_requests.buy');
    Route::get('/purchase-requests/{id}/items/{itemId}/quotes', [App\Http\Controllers\Api\PurchaseRequestController::class, 'listQuotes']);
    Route::post('/purchase-requests/{id}/items/{itemId}/quotes', [App\Http\Controllers\Api\PurchaseRequestController::class, 'storeQuote'])
        ->middleware('permission:purchase_requests.buy');
    Route::delete('/purchase-requests/{id}/items/{itemId}/quotes/{quoteId}', [App\Http\Controllers\Api\PurchaseRequestController::class, 'destroyQuote'])
        ->middleware('permission:purchase_requests.buy');
    Route::post('/purchase-requests/{id}/items/{itemId}/mark-partial', [App\Http\Controllers\Api\PurchaseRequestController::class, 'markPartial'])
        ->middleware('permission:purchase_requests.buy');
    Route::post('/purchase-requests/{id}/items/{itemId}/mark-not-available', [App\Http\Controllers\Api\PurchaseRequestController::class, 'markNotAvailable'])
        ->middleware('permission:purchase_requests.buy');
    Route::post('/purchase-requests/{id}/items/{itemId}/verify-received', [App\Http\Controllers\Api\PurchaseRequestController::class, 'verifyItem'])
        ->middleware('permission:purchase_requests.verify');
    Route::post('/purchase-requests/{id}/items/{itemId}/promote-to-inventory', [App\Http\Controllers\Api\PurchaseRequestController::class, 'promoteToInventory'])
        ->middleware('permission:inventory.manage');

    Route::middleware('permission:purchase_requests.create')->group(function () {
        Route::get('/recurring-shopping-lists', [App\Http\Controllers\Api\RecurringShoppingListController::class, 'index']);
        Route::post('/recurring-shopping-lists', [App\Http\Controllers\Api\RecurringShoppingListController::class, 'store']);
        Route::put('/recurring-shopping-lists/{id}', [App\Http\Controllers\Api\RecurringShoppingListController::class, 'update'])->whereNumber('id');
        Route::delete('/recurring-shopping-lists/{id}', [App\Http\Controllers\Api\RecurringShoppingListController::class, 'destroy'])->whereNumber('id');
    });
}

if (routes_domain_section_is('inventory', 'waste') && !routes_domain_loaded('inventory.waste')) {
    routes_domain_mark_loaded('inventory.waste');

    // Waste Logs (staff)
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:inventory.manage'])->prefix('waste-logs')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\WasteLogController::class, 'index']);
        Route::get('/summary', [App\Http\Controllers\Api\WasteLogController::class, 'summary']);
        Route::post('/', [App\Http\Controllers\Api\WasteLogController::class, 'store']);
    });
}
