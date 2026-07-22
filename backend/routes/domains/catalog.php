<?php

declare(strict_types=1);

require __DIR__.'/_helpers.php';

use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\ItemController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Menu catalog, variants, photos, specials, and reviews
|--------------------------------------------------------------------------
| Main block: loaded at top level from routes/api.php.
| Barcode label block: loaded inside auth:sanctum + staff.token group.
*/

if (routes_domain_section_is('catalog', 'barcode') && ! routes_domain_loaded('catalog.barcode')) {
    routes_domain_mark_loaded('catalog.barcode');

    Route::get('/items/{id}/barcode-label', [ItemController::class, 'barcodeLabel']);
}

if (routes_domain_section_is('catalog', 'main') && ! routes_domain_loaded('catalog.main')) {
    routes_domain_mark_loaded('catalog.main');

    // Public menu access
    Route::middleware('throttle:120,1')->group(function () {
        Route::get('/categories', [CategoryController::class, 'index']);
        Route::get('/categories/{id}', [CategoryController::class, 'show']);
        Route::get('/items', [ItemController::class, 'index']);
        Route::post('/recommendations/cart', [App\Http\Controllers\Api\ItemRecommendationsController::class, 'forCart']);
        Route::get('/items/{id}', [ItemController::class, 'show']);
        Route::get('/items/barcode/{barcode}', [ItemController::class, 'lookupByBarcode']);
    });

    Route::post('/items/stock-check', [ItemController::class, 'bulkStockCheck'])
        ->middleware('throttle:60,1');

    Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->group(function () {
        Route::get('/admin/menu-groups', [App\Http\Controllers\Api\KitchenMenuAdminController::class, 'menuGroups']);
        Route::get('/admin/kitchen-menu-state', [App\Http\Controllers\Api\KitchenMenuAdminController::class, 'kitchenState']);
        Route::patch('/admin/kitchen-menu-state', [App\Http\Controllers\Api\KitchenMenuAdminController::class, 'updateKitchenState']);

        Route::post('/categories', [CategoryController::class, 'store']);
        Route::patch('/categories/{id}', [CategoryController::class, 'update']);
        Route::delete('/categories/{id}', [CategoryController::class, 'destroy']);

        Route::post('/items', [ItemController::class, 'store']);
        Route::get('/items/{id}/recipe', [ItemController::class, 'showWithRecipe']);
        Route::patch('/items/{id}', [ItemController::class, 'update']);
        Route::delete('/items/{id}', [ItemController::class, 'destroy']);
        Route::patch('/items/{id}/toggle-availability', [ItemController::class, 'toggleAvailability']);
    });

    Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->group(function () {
        Route::get('/items/{itemId}/variants', [App\Http\Controllers\Api\VariantController::class, 'index']);
        Route::post('/items/{itemId}/variants', [App\Http\Controllers\Api\VariantController::class, 'store']);
        Route::patch('/items/{itemId}/variants/{id}', [App\Http\Controllers\Api\VariantController::class, 'update']);
        Route::delete('/items/{itemId}/variants/{id}', [App\Http\Controllers\Api\VariantController::class, 'destroy']);
    });

    Route::get('/items/{itemId}/photos', [App\Http\Controllers\Api\ItemPhotoController::class, 'index']);

    Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->group(function () {
        Route::post('/items/{itemId}/photos', [App\Http\Controllers\Api\ItemPhotoController::class, 'store']);
        Route::post('/items/{itemId}/photos/reorder', [App\Http\Controllers\Api\ItemPhotoController::class, 'reorder']);
        Route::patch('/items/{itemId}/photos/{photoId}', [App\Http\Controllers\Api\ItemPhotoController::class, 'update']);
        Route::delete('/items/{itemId}/photos/{photoId}', [App\Http\Controllers\Api\ItemPhotoController::class, 'destroy']);
    });

    Route::get('/specials', [App\Http\Controllers\Api\DailySpecialController::class, 'active']);

    Route::middleware(['auth:sanctum', 'staff.token', 'permission:menu.manage'])->prefix('admin/specials')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\DailySpecialController::class, 'index']);
        Route::get('/{id}', [App\Http\Controllers\Api\DailySpecialController::class, 'show']);
        Route::post('/', [App\Http\Controllers\Api\DailySpecialController::class, 'store']);
        Route::patch('/{id}', [App\Http\Controllers\Api\DailySpecialController::class, 'update']);
        Route::delete('/{id}', [App\Http\Controllers\Api\DailySpecialController::class, 'destroy']);
    });

    Route::get('/items/{itemId}/reviews', [App\Http\Controllers\Api\ReviewController::class, 'itemReviews']);
    Route::get('/reviews/featured', [App\Http\Controllers\Api\ReviewController::class, 'featured'])
        ->middleware('throttle:60,1');

    Route::post('/catering-requests', [App\Http\Controllers\Api\CateringRequestController::class, 'store'])
        ->middleware(['throttle:10,1', 'service.available:catering_inquiry']);
    // Legacy alias
    Route::post('/corporate-inquiries', [App\Http\Controllers\Api\CorporateInquiryController::class, 'store'])
        ->middleware('throttle:10,1');

    Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
        Route::post('/reviews', [App\Http\Controllers\Api\ReviewController::class, 'store']);
        Route::get('/customer/reviews', [App\Http\Controllers\Api\ReviewController::class, 'myReviews']);
    });

    Route::middleware(['auth:sanctum', 'staff.token', 'permission:customers.manage'])->prefix('admin/reviews')->group(function () {
        Route::get('/', [App\Http\Controllers\Api\ReviewController::class, 'adminIndex']);
        Route::patch('/{id}/moderate', [App\Http\Controllers\Api\ReviewController::class, 'moderate']);
    });
}
