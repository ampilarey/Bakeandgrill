Route::middleware(['auth:sanctum', 'staff.token'])->group(function () {
    // Get current user (staff)
    Route::get('/auth/me', [StaffAuthController::class, 'me']);

    // POS bootstrap — menu + current shift in one login round trip
    Route::get('/pos/bootstrap', [App\Http\Controllers\Api\PosBootstrapController::class, 'index'])
        ->middleware('throttle:120,1');
    // POS menu — channel refetch after order-type change (no shift payload)
    Route::get('/pos/menu', [App\Http\Controllers\Api\PosMenuController::class, 'index'])
        ->middleware('throttle:120,1');
    Route::patch('/auth/me/preferences', [StaffAuthController::class, 'updatePreferences']);

    // Online ordering gate — toggle (owner/manager) and public status is above
    Route::prefix('admin/ordering')->middleware('permission:settings.update')->group(function () {
        Route::post('/toggle', [App\Http\Controllers\Api\OnlineOrderingController::class, 'toggle']);
        Route::post('/override', [App\Http\Controllers\Api\OnlineOrderingController::class, 'override']);
        Route::put('/schedule', [App\Http\Controllers\Api\OnlineOrderingController::class, 'updateSchedule']);
        Route::post('/delivery-toggle', [App\Http\Controllers\Api\OnlineOrderingController::class, 'toggleDelivery']);
        Route::put('/delivery-schedule', [App\Http\Controllers\Api\OnlineOrderingController::class, 'updateDeliverySchedule']);
        Route::post('/delivery-override', [App\Http\Controllers\Api\OnlineOrderingController::class, 'deliveryOverride']);
    });

    Route::prefix('admin/delivery')->middleware('permission:settings.update')->group(function () {
        Route::get('/settings', [App\Http\Controllers\Api\DeliverySettingsController::class, 'show']);
        Route::patch('/settings', [App\Http\Controllers\Api\DeliverySettingsController::class, 'update']);
    });

    Route::prefix('admin/ops')->middleware('permission:settings.update')->group(function () {
        Route::get('/alerts', [App\Http\Controllers\Api\OpsAlertsController::class, 'show']);
        Route::patch('/alerts', [App\Http\Controllers\Api\OpsAlertsController::class, 'update']);
    });

    Route::prefix('admin/settings/service-charge')->middleware('permission:settings.update')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\ServiceChargeSettingsController::class, 'show']);
        Route::put('/', [App\Http\Controllers\Api\ServiceChargeSettingsController::class, 'update']);
    });
    Route::prefix('admin/settings/payment-commission')->middleware('permission:settings.update')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\PaymentCommissionSettingsController::class, 'show']);
        Route::put('/', [App\Http\Controllers\Api\PaymentCommissionSettingsController::class, 'update']);
    });
    Route::prefix('admin/settings/packaging-fee')->middleware('permission:settings.update')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\PackagingFeeSettingsController::class, 'show']);
        Route::patch('/', [App\Http\Controllers\Api\PackagingFeeSettingsController::class, 'update']);
    });
    Route::prefix('admin/gst/settings')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\GstSettingsController::class, 'show'])
            ->middleware('permission:reports.financial');
        Route::put('/', [App\Http\Controllers\Api\GstSettingsController::class, 'update'])
            ->middleware('permission:settings.update');
    });

    // Device Management — read (devices.view) vs mutate (manage / approve)
    Route::prefix('devices')->group(function () {
        Route::get('/', [DeviceController::class, 'index'])->middleware('permission:devices.view');
        Route::get('/pending', [DeviceController::class, 'pending'])->middleware('permission:devices.view');
        Route::post('/register', [DeviceController::class, 'register'])
            ->middleware(['permission:devices.manage', 'throttle:10,1']);
        Route::patch('/{id}', [DeviceController::class, 'update'])->middleware('permission:devices.manage');
        Route::patch('/{id}/approve', [DeviceController::class, 'approve'])->middleware('permission:devices.approve');
        Route::patch('/{id}/reject', [DeviceController::class, 'reject'])->middleware('permission:devices.approve');
        Route::patch('/{id}/disable', [DeviceController::class, 'disable'])->middleware('permission:devices.manage');
        Route::patch('/{id}/enable', [DeviceController::class, 'enable'])->middleware('permission:devices.manage');
        Route::delete('/{id}', [DeviceController::class, 'destroy'])->middleware('permission:devices.manage');
    });

    // Device self-registration (any authenticated staff, no device.active check)
    Route::post('/devices/self-register', [DeviceController::class, 'selfRegister'])->middleware('throttle:10,1');
    Route::get('/devices/self-status', [DeviceController::class, 'selfStatus']);

    // Orders
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store'])
        ->middleware(['permission:pos.ring_sales', 'device.active']);
    Route::post('/orders/sync', [OrderController::class, 'sync'])
        ->middleware(['permission:pos.ring_sales', 'device.active']);
    Route::get('/orders/{id}', [OrderController::class, 'show']);
    Route::post('/orders/{id}/hold', [OrderController::class, 'hold'])
        ->middleware(['permission:pos.hold_resume', 'throttle:20,1']);
    Route::post('/orders/{id}/resume', [OrderController::class, 'resume'])
        ->middleware(['permission:pos.hold_resume', 'throttle:20,1']);
    // Phone-call pickup workflow: send a held ticket to the kitchen
    // without taking payment yet (POS "Save & Fire"), then later SMS
    // the customer a BML Connect pay link for the remaining balance.
    Route::post('/orders/{id}/fire-to-kitchen', [OrderController::class, 'fireToKitchen'])
        ->middleware(['permission:pos.hold_resume', 'throttle:20,1']);
    Route::post('/orders/{id}/send-pay-link', [OrderController::class, 'sendPayLink'])
        ->middleware(['permission:orders.send_payment_link', 'throttle:10,1']);
    // Cashier-callable lifecycle bumps — POS equivalents of KDS
    // bump/complete. Lets a cashier-only setup (no KDS terminal) move
    // pickup orders through ready → completed and trigger the
    // customer-facing SMS chain without the kitchen needing extra
    // hardware.
    Route::post('/orders/{id}/start-cooking', [OrderController::class, 'startCooking'])
        ->middleware(['permission:pos.manage_order_status', 'throttle:30,1']);
    Route::post('/orders/{id}/mark-ready', [OrderController::class, 'markReady'])
        ->middleware(['permission:pos.manage_order_status', 'throttle:30,1']);
    Route::post('/orders/{id}/mark-picked-up', [OrderController::class, 'markPickedUp'])
        ->middleware(['permission:pos.manage_order_status', 'throttle:30,1']);
    // Void a non-terminal ticket from the POS Active Orders panel —
    // returns deducted POS stock, releases promo/loyalty/gift-card
    // holds, frees the dine-in table, audit-logs the cashier + reason.
    // Refuses paid/completed/refunded states (those go via refund).
    // Tighter throttle than mark-ready because voids are destructive.
    // Permission gate (orders.void) is ALSO enforced inside the controller
    // so the policy + DB-override path stays the single source of truth.
    Route::post('/orders/{id}/cancel', [OrderController::class, 'cancel'])
        ->middleware(['permission:orders.void', 'device.active', 'throttle:10,1']);
    // Active-ticket editing — POS "Save changes" lets a cashier swap
    // out the line items on a parked / cooking / ready ticket and
    // reprint the kitchen chit in one round-trip.
    Route::patch('/orders/{id}/items', [OrderController::class, 'updateItems'])
        ->middleware(['permission:pos.hold_resume', 'throttle:30,1']);
    // Open-ticket consolidation — merge two tickets into one or split
    // selected items off into a sibling ticket. Same editable-state
    // guards as updateItems.
    Route::post('/orders/{id}/merge', [OrderController::class, 'merge'])
        ->middleware(['permission:pos.hold_resume', 'throttle:10,1']);
    Route::post('/orders/{id}/split', [OrderController::class, 'split'])
        ->middleware(['permission:pos.hold_resume', 'throttle:10,1']);
    Route::post('/orders/{id}/payments', [OrderController::class, 'addPayments'])
        ->middleware(['permission:pos.ring_sales', 'device.active', 'throttle:20,1']);
    Route::post('/orders/{id}/send-bill', [OrderController::class, 'sendBill'])
        ->middleware(['permission:orders.send_sms_bill', 'throttle:10,1']);
    Route::patch('/orders/{id}/customer', [OrderController::class, 'updateCustomer'])
        ->middleware(['permission:pos.ring_sales', 'throttle:30,1']);

    // KDS — list endpoint stays unauthenticated by device (any approved
    // staff token can pull the kitchen queue read-only). Mutations
    // (start/bump/recall) require an approved device header so a stolen
    // staff token alone can't progress the queue from an off-prem
    // browser.
    Route::get('/kds/orders', [KdsController::class, 'index'])->middleware('permission:kds.view');
    Route::get('/kds/menu-groups', [KdsController::class, 'menuGroups'])->middleware('permission:kds.view');
    Route::post('/kds/items/{id}/86', [KdsController::class, 'toggleItemAvailability'])
        ->middleware('permission:kds.manage_availability');
    Route::post('/kds/orders/{id}/start', [KdsController::class, 'start'])
        ->middleware(['permission:kds.start_order', 'device.active']);
    Route::post('/kds/orders/{id}/kitchen-done', [KdsController::class, 'kitchenDone'])
        ->middleware(['permission:kds.mark_kitchen_done', 'device.active']);
    Route::post('/kds/orders/{orderId}/items/{orderItemId}/cooked', [KdsController::class, 'markItemCooked'])
        ->middleware(['permission:kitchen.production.create', 'device.active']);
    Route::post('/kds/orders/{id}/print-ticket', [KdsController::class, 'printTicket'])
        ->middleware(['permission:kds.print_ticket', 'device.active']);
    Route::post('/kds/orders/{id}/bump', [KdsController::class, 'bump'])
        ->middleware(['permission:kds.bump_order', 'device.active']);
    Route::post('/kds/orders/{id}/recall', [KdsController::class, 'recall'])
        ->middleware(['permission:kds.recall_order', 'device.active']);

    // Print jobs
    Route::get('/print-jobs', [PrintJobController::class, 'index'])->middleware('permission:devices.view');
    Route::post('/print-jobs/{id}/retry', [PrintJobController::class, 'retry'])->middleware('permission:devices.manage');

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

    Route::middleware('permission:menu.prepared_stock')->group(function () {
        Route::get('/prepared-stock', [App\Http\Controllers\Api\PreparedStockController::class, 'index']);
        Route::post('/items/{id}/prepared-stock/adjust', [App\Http\Controllers\Api\PreparedStockController::class, 'adjust']);
    });

    // Finance & Inventory Routes (invoices, expenses, reports, supplier intelligence,
    // purchase workflow, forecasting) — required HERE so static paths like
    // /suppliers/performance and /purchases/suggest are registered BEFORE the
    // {id} wildcard routes below, preventing route shadowing.
    require __DIR__ . '/finance.php'; // __DIR__ is routes/domains when loaded via api.php

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
    Route::middleware('permission:suppliers.purchases')->group(function () {
        Route::get('/purchases', [PurchaseController::class, 'index']);
        Route::post('/purchases', [PurchaseController::class, 'store']);
        Route::get('/purchases/{id}', [PurchaseController::class, 'show']);
        Route::patch('/purchases/{id}', [PurchaseController::class, 'update']);
        Route::post('/purchases/{id}/receipts', [PurchaseController::class, 'uploadReceipt']);
        Route::post('/purchases/import', [PurchaseController::class, 'import']);
    });

    // Purchase Requests — operational buying tasks (staff request, manager verify)
    Route::post('/purchase-requests', [App\Http\Controllers\Api\PurchaseRequestController::class, 'store'])
        ->middleware('permission:purchase_requests.create');
    Route::get('/purchase-requests/my', [App\Http\Controllers\Api\PurchaseRequestController::class, 'my'])
        ->middleware('permission:purchase_requests.view_own');
    Route::get('/purchase-requests/assigned-to-me', [App\Http\Controllers\Api\PurchaseRequestController::class, 'assignedToMe'])
        ->middleware('permission:purchase_requests.view_own');
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
    Route::post('/purchase-requests/{id}/items/{itemId}/mark-partial', [App\Http\Controllers\Api\PurchaseRequestController::class, 'markPartial'])
        ->middleware('permission:purchase_requests.buy');
    Route::post('/purchase-requests/{id}/items/{itemId}/mark-not-available', [App\Http\Controllers\Api\PurchaseRequestController::class, 'markNotAvailable'])
        ->middleware('permission:purchase_requests.buy');
    Route::post('/purchase-requests/{id}/items/{itemId}/verify-received', [App\Http\Controllers\Api\PurchaseRequestController::class, 'verifyItem'])
        ->middleware('permission:purchase_requests.verify');

    // Kitchen production & receiving
    Route::get('/kitchen-handover/settings', [App\Http\Controllers\Api\KitchenReceivingController::class, 'settings'])
        ->middleware('permission:kitchen.receiving.view');
    Route::put('/kitchen-handover/settings', [App\Http\Controllers\Api\KitchenVarianceController::class, 'updateSettings'])
        ->middleware('permission:kitchen.production.manage');

    Route::get('/kitchen-production', [App\Http\Controllers\Api\KitchenProductionController::class, 'index'])
        ->middleware('permission:kitchen.production.view_own');
    Route::post('/kitchen-production', [App\Http\Controllers\Api\KitchenProductionController::class, 'store'])
        ->middleware('permission:kitchen.production.create');
    Route::get('/kitchen-production/{id}', [App\Http\Controllers\Api\KitchenProductionController::class, 'show']);
    Route::post('/kitchen-production/{id}/submit', [App\Http\Controllers\Api\KitchenProductionController::class, 'submit'])
        ->middleware('permission:kitchen.production.submit');
    Route::post('/kitchen-production/{id}/cancel', [App\Http\Controllers\Api\KitchenProductionController::class, 'cancel']);
    Route::post('/kitchen-production/{id}/items/{itemId}/waste', [App\Http\Controllers\Api\KitchenProductionController::class, 'recordWaste'])
        ->middleware('permission:kitchen.production.record_waste');
    Route::post('/kitchen-production/{id}/items/{itemId}/remake', [App\Http\Controllers\Api\KitchenProductionController::class, 'recordRemake'])
        ->middleware('permission:kitchen.production.record_remake');
    Route::post('/kitchen-production/{id}/attachments', [App\Http\Controllers\Api\KitchenProductionController::class, 'uploadAttachment'])
        ->middleware('permission:kitchen.production.attach_photo');

    Route::get('/kitchen-receiving/pending', [App\Http\Controllers\Api\KitchenReceivingController::class, 'pending'])
        ->middleware('permission:kitchen.receiving.view');
    Route::get('/kitchen-receiving/orders/{orderId}', [App\Http\Controllers\Api\KitchenReceivingController::class, 'forOrder'])
        ->middleware('permission:kitchen.receiving.view');
    Route::post('/kitchen-receiving/{productionBatchId}/receive-all', [App\Http\Controllers\Api\KitchenReceivingController::class, 'receiveAll'])
        ->middleware('permission:kitchen.receiving.receive');
    Route::post('/kitchen-receiving/{productionBatchId}/items/{itemId}/receive', [App\Http\Controllers\Api\KitchenReceivingController::class, 'receiveItem'])
        ->middleware('permission:kitchen.receiving.receive');
    Route::post('/kitchen-receiving/{productionBatchId}/items/{itemId}/reject', [App\Http\Controllers\Api\KitchenReceivingController::class, 'rejectItem'])
        ->middleware('permission:kitchen.receiving.reject');
    Route::post('/kitchen-receiving/{productionBatchId}/items/{itemId}/request-remake', [App\Http\Controllers\Api\KitchenReceivingController::class, 'requestRemake'])
        ->middleware('permission:kitchen.receiving.request_remake');
    Route::post('/kitchen-receiving/{productionBatchId}/attachments', [App\Http\Controllers\Api\KitchenReceivingController::class, 'uploadAttachment'])
        ->middleware('permission:kitchen.receiving.attach_photo');

    Route::get('/kitchen-variance', [App\Http\Controllers\Api\KitchenVarianceController::class, 'index'])
        ->middleware('permission:kitchen.variance.review');
    Route::post('/kitchen-variance/{id}/review', [App\Http\Controllers\Api\KitchenVarianceController::class, 'review'])
        ->middleware('permission:kitchen.variance.review');

    Route::get('/kitchen-reports/summary', [App\Http\Controllers\Api\KitchenProductionReportController::class, 'productionSummary'])
        ->middleware('permission:kitchen.production.reports');
    Route::get('/kitchen-reports/handover', [App\Http\Controllers\Api\KitchenProductionReportController::class, 'handoverReport'])
        ->middleware('permission:kitchen.production.reports');
    Route::get('/kitchen-reports/waste', [App\Http\Controllers\Api\KitchenProductionReportController::class, 'wasteReport'])
        ->middleware('permission:kitchen.production.reports');
    Route::get('/kitchen-reports/staff-output', [App\Http\Controllers\Api\KitchenProductionReportController::class, 'staffOutput'])
        ->middleware('permission:kitchen.production.reports');
    Route::get('/kitchen-reports/pos-receiving', [App\Http\Controllers\Api\KitchenProductionReportController::class, 'posReceivingReport'])
        ->middleware('permission:kitchen.production.reports');

    // Customers — lightweight POS lookup / quick-create (any authenticated staff)
    Route::get('/customers/search', [CustomerController::class, 'search'])
        ->middleware(['permission:customers.lookup', 'throttle:60,1']);
    Route::post('/customers/quick', [CustomerController::class, 'quickCreate'])
        ->middleware(['permission:customers.create', 'throttle:30,1']);
    // Add/fix a customer's name or email straight from the POS chip —
    // intentionally name/email only, NOT phone (see updateFromPos doc).
    Route::patch('/customers/{id}', [CustomerController::class, 'updateFromPos'])
        ->middleware(['permission:customers.lookup', 'throttle:30,1']);
    // Compact customer "dashboard" for the POS Customer chip (profile +
    // loyalty + lifetime stats + last 5 paid orders). One round-trip
    // when the cashier attaches a customer to a ticket.
    Route::get('/customers/{id}/pos-summary', [CustomerController::class, 'posSummary'])
        ->middleware(['permission:customers.lookup', 'throttle:60,1']);
    Route::get('/customers/{id}/addresses', [App\Http\Controllers\Api\CustomerAddressController::class, 'indexForCustomer'])
        ->middleware('throttle:60,1');

    // ── POS rewards on an in-progress ticket ─────────────────────────────────
    // Staff-only twins of the customer-facing loyalty + gift-card endpoints.
    // The original /loyalty/* and /orders/{id}/gift-card routes are pinned
    // to a customer token (so the online ordering app keeps working
    // unchanged); these /pos/* twins let a cashier redeem on behalf of
    // the customer attached to the ticket.
    Route::prefix('pos')->group(function (): void {
        Route::post('/offline-sync', [App\Http\Controllers\Api\PosOfflineSyncController::class, 'sync'])
            ->middleware(['permission:pos.ring_sales', 'device.active', 'throttle:20,1']);

        Route::post('/loyalty/preview', [App\Http\Controllers\Api\LoyaltyController::class, 'posHoldPreview']);
        Route::post('/loyalty/hold', [App\Http\Controllers\Api\LoyaltyController::class, 'posHold']);
        Route::delete('/loyalty/hold/{orderId}', [App\Http\Controllers\Api\LoyaltyController::class, 'posReleaseHold']);

        Route::post('/orders/{orderId}/gift-card', [App\Http\Controllers\Api\GiftCardController::class, 'staffApplyToOrder']);
        Route::delete('/orders/{orderId}/gift-card', [App\Http\Controllers\Api\GiftCardController::class, 'staffRemoveFromOrder']);
    });

    // Shifts + cash drawer
    Route::get('/shifts/current', [ShiftController::class, 'current'])
        ->middleware('permission:pos.open_shift');
    Route::get('/shifts/history', [ShiftController::class, 'history'])
        ->middleware('permission:shifts.view_own_history');
    Route::get('/shifts/live', [ShiftController::class, 'live'])
        ->middleware('permission:shifts.view_all_history');
    Route::get('/shifts/{id}/summary', [ShiftController::class, 'summary'])
        ->middleware('permission:shifts.view_own_history');
    Route::post('/shifts/open', [ShiftController::class, 'open'])
        ->middleware(['permission:pos.open_shift', 'throttle:5,1']);
    Route::post('/shifts/{id}/close', [ShiftController::class, 'close'])
        ->middleware(['permission:pos.close_shift', 'throttle:5,1']);
    Route::post('/shifts/{id}/force-close', [ShiftController::class, 'forceClose'])
        ->middleware(['permission:shifts.view_all_history', 'throttle:5,1']);
    Route::post('/shifts/{id}/cash-movements', [CashMovementController::class, 'store'])
        ->middleware(['permission:payments.cash_in_out', 'device.active', 'throttle:30,1']);

    // Reports — restricted to users with reports.view permission
    Route::middleware('permission:reports.view')->group(function () {
        Route::get('/reports/sales-summary', [ReportsController::class, 'salesSummary']);
        Route::get('/reports/sales-breakdown', [ReportsController::class, 'salesBreakdown']);
        Route::get('/reports/x-report', [ReportsController::class, 'xReport']);
        Route::get('/reports/z-report', [ReportsController::class, 'zReport']);
        Route::get('/reports/inventory-valuation', [ReportsController::class, 'inventoryValuation']);
        Route::get('/reports/delivery-zones', [ReportsController::class, 'deliveryZones']);
        Route::get('/reports/discounts-by-type', [ReportsController::class, 'discountsByType']);
        Route::get('/reports/voids-by-staff', [ReportsController::class, 'voidsByStaff']);
        Route::get('/reports/refunds-by-reason', [ReportsController::class, 'refundsByReason']);
        Route::get('/reports/credit-exposure', [ReportsController::class, 'creditExposure']);
        Route::get('/reports/manager-overrides', [ReportsController::class, 'managerOverrides']);
        Route::get('/reports/stock-velocity', [ReportsController::class, 'stockVelocity']);
        Route::get('/reports/driver-settlement', [ReportsController::class, 'driverSettlement']);
        Route::get('/reports/shift-variances', [ReportsController::class, 'shiftVariances']);
        Route::get('/reports/customer-ltv', [ReportsController::class, 'customerLtv']);
        Route::get('/reports/cashier-performance', [ReportsController::class, 'cashierPerformance']);
        Route::get('/reports/product-margins', [ReportsController::class, 'productMargins']);
        Route::get('/reports/customer-cohorts', [ReportsController::class, 'customerCohorts']);
        Route::get('/reports/stock-discrepancy', [ReportsController::class, 'stockDiscrepancy']);
        Route::get('/reports/hourly-sales', [ReportsController::class, 'hourlySales']);
        Route::get('/reports/station-performance', [ReportsController::class, 'stationPerformance']);
        Route::get('/reports/sales-summary/csv', [ReportsController::class, 'salesSummaryCsv'])->middleware('throttle:20,1');
        Route::get('/reports/sales-breakdown/csv', [ReportsController::class, 'salesBreakdownCsv'])->middleware('throttle:20,1');
        Route::get('/reports/x-report/csv', [ReportsController::class, 'xReportCsv'])->middleware('throttle:20,1');
        Route::get('/reports/z-report/csv', [ReportsController::class, 'zReportCsv'])->middleware('throttle:20,1');
        Route::get('/reports/inventory-valuation/csv', [ReportsController::class, 'inventoryValuationCsv'])->middleware('throttle:20,1');
    });

    // Tables
    Route::get('/tables', [TableController::class, 'index'])->middleware('permission:orders.view');
    Route::post('/tables', [TableController::class, 'store'])->middleware('permission:orders.manage');
    Route::patch('/tables/{id}', [TableController::class, 'update'])->middleware('permission:orders.manage');
    Route::post('/tables/{id}/open', [TableController::class, 'open'])
        ->middleware(['permission:orders.manage', 'device.active']);
    Route::post('/tables/{tableId}/orders/{orderId}/items', [TableController::class, 'addItems'])
        ->middleware(['permission:orders.manage', 'device.active']);
    Route::post('/tables/{id}/close', [TableController::class, 'close'])->middleware('permission:orders.manage');
    Route::post('/tables/merge', [TableController::class, 'merge'])->middleware('permission:orders.manage');
    Route::post('/tables/{id}/split', [TableController::class, 'split'])->middleware('permission:orders.manage');

    // Receipts (staff)
    Route::get('/orders/{orderId}/receipt-link', [ReceiptController::class, 'linkForOrder']);
    Route::post('/receipts/{orderId}/send', [ReceiptController::class, 'send']);

    // Refunds — list/show/create all require refund.process (owner/manager
    // or explicit orders.refund grant). Gate::authorize in controller matches.
    Route::get('/refunds', [RefundController::class, 'index'])
        ->middleware('permission:orders.refund');
    Route::get('/refunds/{id}', [RefundController::class, 'show'])
        ->middleware('permission:orders.refund');
    Route::post('/orders/{orderId}/refunds', [RefundController::class, 'store'])
        ->middleware(['permission:orders.refund', 'throttle:10,1']);

    // SMS promotions — preview/list for marketing staff; send is manager-only
    Route::get('/sms/promotions', [SmsPromotionController::class, 'index'])
        ->middleware('permission:integrations.sms');
    Route::get('/sms/promotions/{id}', [SmsPromotionController::class, 'show'])
        ->middleware('permission:integrations.sms');
    Route::post('/sms/promotions/preview', [SmsPromotionController::class, 'preview'])
        ->middleware(['permission:integrations.sms', 'throttle:10,5']);
    Route::post('/sms/promotions/send', [SmsPromotionController::class, 'send'])
        ->middleware(['permission:integrations.sms', 'throttle:5,60']);
});

/*
|--------------------------------------------------------------------------
| Protected Customer Routes
|--------------------------------------------------------------------------
| Customer ability checked in controllers
*/
