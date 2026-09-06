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
        // What each brand and pack size costs per base unit, and how much of
        // the item was bought, used and thrown away over the window.
        Route::get('/inventory/{id}/cost-usage', [InventoryController::class, 'costUsage']);
    });
    Route::post('/inventory', [InventoryController::class, 'store'])->middleware('permission:inventory.manage');
    Route::post('/inventory/stock-count', [InventoryController::class, 'stockCount'])->middleware('permission:inventory.manage');

    /*
     * Stocktake sessions — open, count blind, submit, review, post.
     *
     * Declared before the /inventory/{id} wildcard above would otherwise
     * shadow them. Counting and posting are separate permissions on purpose:
     * the person who counted does not accept their own variance.
     */
    Route::middleware('permission:inventory.stock_count')->group(function () {
        Route::get('/stock-counts/active', [App\Http\Controllers\Api\StockCountSessionController::class, 'active']);
        Route::get('/stock-counts', [App\Http\Controllers\Api\StockCountSessionController::class, 'index']);
        Route::get('/stock-counts/{id}', [App\Http\Controllers\Api\StockCountSessionController::class, 'show'])->whereNumber('id');
        Route::post('/stock-counts', [App\Http\Controllers\Api\StockCountSessionController::class, 'store']);
        Route::post('/stock-counts/{id}/counts', [App\Http\Controllers\Api\StockCountSessionController::class, 'saveCounts'])->whereNumber('id');
        Route::post('/stock-counts/{id}/submit', [App\Http\Controllers\Api\StockCountSessionController::class, 'submit'])->whereNumber('id');
        Route::post('/stock-counts/{id}/cancel', [App\Http\Controllers\Api\StockCountSessionController::class, 'cancel'])->whereNumber('id');
    });
    Route::middleware('permission:inventory.stock_count.post')->group(function () {
        Route::post('/stock-counts/{id}/post', [App\Http\Controllers\Api\StockCountSessionController::class, 'post'])->whereNumber('id');
        Route::post('/stock-counts/{id}/reopen', [App\Http\Controllers\Api\StockCountSessionController::class, 'reopen'])->whereNumber('id');
    });
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
        // Removing a purchase order is a soft delete guarded by
        // PurchaseEditPolicy: only a draft, or a cancelled order that never
        // received a thing.
        Route::delete('/purchases/{id}', [PurchaseController::class, 'destroy'])->whereNumber('id');
        Route::post('/purchases/{id}/receipts', [PurchaseController::class, 'uploadReceipt'])->whereNumber('id');
    });

    // Every switch that governs buying, on one screen (Purchasing → Settings).
    // Owner-level: these decide who approves what and when money moves.
    Route::middleware('permission:settings.update')->group(function () {
        Route::get('/purchasing/settings', [App\Http\Controllers\Api\PurchasingSettingsController::class, 'show']);
        Route::patch('/purchasing/settings', [App\Http\Controllers\Api\PurchasingSettingsController::class, 'update']);
    });

    // Purchase Requests — operational buying tasks (staff request, manager verify)
    Route::post('/purchase-requests', [App\Http\Controllers\Api\PurchaseRequestController::class, 'store'])
        ->middleware('permission:purchase_requests.create');
    // The list staff pick from. Same permission as raising a request, because
    // it is part of raising one — kitchen staff can request but hold no
    // inventory.view, so gating this on that would hide the list from them.
    Route::get('/purchase-requests/catalog', [App\Http\Controllers\Api\PurchaseRequestController::class, 'catalog'])
        ->middleware('permission:purchase_requests.create');
    // Everything bought and not yet accepted — the delivery list both POS and
    // KDS show, so nobody has to hunt through their own requests to find it.
    Route::get('/purchase-requests/to-receive', [App\Http\Controllers\Api\PurchaseRequestController::class, 'toReceive'])
        ->middleware('permission:purchase_requests.receive');
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
    // Accepting one delivered line is floor work — the box arrives at the back
    // door and a cook or a cashier is standing there. `verify` satisfies
    // `receive`, so managers are unaffected. Who may accept is only half the
    // guard: the service also refuses the person who bought it.
    Route::post('/purchase-requests/{id}/items/{itemId}/verify-received', [App\Http\Controllers\Api\PurchaseRequestController::class, 'verifyItem'])
        ->middleware('permission:purchase_requests.receive');
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
