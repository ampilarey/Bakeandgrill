<?php

declare(strict_types=1);

require __DIR__ . '/_helpers.php';

use App\Http\Controllers\Api\ReportsController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Operational and analytics reporting routes
|--------------------------------------------------------------------------
| Reports block: loaded inside auth:sanctum + staff.token group.
| Analytics block: loaded at top level.
*/

if (routes_domain_section_is_or_unset('reporting', 'reports', 'reports') && !routes_domain_loaded('reporting.reports')) {
    routes_domain_mark_loaded('reporting.reports');

    // Reports — restricted to users with reports.view permission
    Route::middleware('permission:reports.view')->group(function () {
        // Dashboard "big numbers": lifetime orders/customers/revenue + visits.
        Route::get('/admin/site-stats', [App\Http\Controllers\Api\SiteStatsController::class, 'stats']);
        Route::get('/reports/sales-summary', [ReportsController::class, 'salesSummary']);
        Route::get('/reports/sales-breakdown', [ReportsController::class, 'salesBreakdown']);
        Route::get('/reports/x-report', [ReportsController::class, 'xReport']);
        Route::get('/reports/z-report', [ReportsController::class, 'zReport']);
        Route::get('/reports/inventory-valuation', [ReportsController::class, 'inventoryValuation']);
        Route::get('/reports/spend-by-item', [ReportsController::class, 'spendByItem']);
        Route::get('/reports/delivery-zones', [ReportsController::class, 'deliveryZones']);
        Route::get('/reports/discounts-by-type', [ReportsController::class, 'discountsByType']);
        Route::get('/reports/voids-by-staff', [ReportsController::class, 'voidsByStaff']);
        Route::get('/reports/voids-by-reason', [ReportsController::class, 'voidsByReason']);
        Route::get('/reports/refunds-by-reason', [ReportsController::class, 'refundsByReason']);
        Route::get('/reports/credit-exposure', [ReportsController::class, 'creditExposure']);
        Route::get('/reports/deposit-exposure', [ReportsController::class, 'depositExposure']);
        Route::get('/reports/deposit-activity', [ReportsController::class, 'depositActivity']);
        Route::get('/reports/manager-overrides', [ReportsController::class, 'managerOverrides']);
        Route::get('/reports/stock-velocity', [ReportsController::class, 'stockVelocity']);
        Route::get('/reports/driver-settlement', [ReportsController::class, 'driverSettlement']);
        Route::get('/reports/shift-variances', [ReportsController::class, 'shiftVariances']);
        Route::get('/reports/customer-ltv', [ReportsController::class, 'customerLtv']);
        Route::get('/reports/cashier-performance', [ReportsController::class, 'cashierPerformance']);
        Route::get('/reports/product-margins', [ReportsController::class, 'productMargins']);
        Route::get('/reports/customer-cohorts', [ReportsController::class, 'customerCohorts']);
        Route::get('/reports/stock-discrepancy', [ReportsController::class, 'stockDiscrepancy']);
        // S4: recipe-theoretical usage against what the counts had to correct.
        Route::get('/reports/usage-variance', [ReportsController::class, 'usageVariance']);
        Route::get('/reports/hourly-sales', [ReportsController::class, 'hourlySales']);
        Route::get('/reports/station-performance', [ReportsController::class, 'stationPerformance']);
        Route::get('/reports/sales-summary/csv', [ReportsController::class, 'salesSummaryCsv'])->middleware('throttle:20,1');
        Route::get('/reports/sales-breakdown/csv', [ReportsController::class, 'salesBreakdownCsv'])->middleware('throttle:20,1');
        Route::get('/reports/x-report/csv', [ReportsController::class, 'xReportCsv'])->middleware('throttle:20,1');
        Route::get('/reports/z-report/csv', [ReportsController::class, 'zReportCsv'])->middleware('throttle:20,1');
        Route::get('/reports/inventory-valuation/csv', [ReportsController::class, 'inventoryValuationCsv'])->middleware('throttle:20,1');
        // FIX 9b: CSV export of the credit exposure snapshot.
        Route::get('/reports/credit-exposure/csv', [ReportsController::class, 'creditExposureCsv'])->middleware('throttle:20,1');
        Route::get('/reports/usage-variance/csv', [ReportsController::class, 'usageVarianceCsv'])->middleware('throttle:20,1');
    });
}

if (routes_domain_section_is('reporting', 'analytics') && !routes_domain_loaded('reporting.analytics')) {
    routes_domain_mark_loaded('reporting.analytics');

    // ─── Analytics ────────────────────────────────────────────────────────────────
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:customers.analytics'])->prefix('admin/analytics')->group(function () {
        Route::get('/peak-hours', [App\Http\Controllers\Api\AnalyticsController::class, 'peakHours']);
        Route::get('/retention', [App\Http\Controllers\Api\AnalyticsController::class, 'retention']);
        Route::get('/profitability', [App\Http\Controllers\Api\AnalyticsController::class, 'profitability']);
        Route::get('/forecast', [App\Http\Controllers\Api\AnalyticsController::class, 'forecast']);
        Route::get('/customer-ltv', [App\Http\Controllers\Api\AnalyticsController::class, 'customerLtv']);
    });
}
