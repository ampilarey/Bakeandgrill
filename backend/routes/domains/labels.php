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
    ->middleware(['permission:labels.print', 'throttle:120,1']);
Route::get('/labels/jobs', [LabelsController::class, 'jobs'])
    ->middleware('permission:labels.print');
Route::get('/labels/jobs/{job}', [LabelsController::class, 'job'])
    ->middleware('permission:labels.print')
    ->whereNumber('job');
Route::put('/labels/jobs/{job}', [LabelsController::class, 'updateJob'])
    ->middleware('permission:labels.print')
    ->whereNumber('job');
Route::post('/labels/jobs/{job}/print', [LabelsController::class, 'printJob'])
    ->middleware(['permission:labels.print', 'throttle:120,1'])
    ->whereNumber('job');
Route::post('/labels/jobs/{job}/duplicate', [LabelsController::class, 'duplicateJob'])
    ->middleware('permission:labels.print')
    ->whereNumber('job');
Route::delete('/labels/jobs/{job}', [LabelsController::class, 'destroyJob'])
    ->middleware('permission:labels.print')
    ->whereNumber('job');
Route::get('/labels/prints', [LabelsController::class, 'prints'])
    ->middleware('permission:labels.print');
// Printed stock near its expiry (2026-10-12), from the print log.
Route::get('/labels/expiring', [LabelsController::class, 'expiring'])
    ->middleware('permission:labels.print');
Route::get('/labels/settings', [LabelsController::class, 'settings'])
    ->middleware('permission:labels.print');
Route::put('/labels/settings', [LabelsController::class, 'updateSettings'])
    ->middleware('permission:labels.manage');
Route::post('/labels/box/url', [LabelsController::class, 'boxUrl'])
    ->middleware(['permission:labels.print', 'throttle:120,1']);
Route::get('/labels/deliveries/{delivery}/box-label', [LabelsController::class, 'deliveryBoxLabel'])
    ->middleware('permission:labels.print')
    ->whereNumber('delivery');
Route::get('/labels/types', [LabelsController::class, 'types'])
    ->middleware('permission:labels.print');
Route::post('/labels/types', [LabelsController::class, 'storeType'])
    ->middleware('permission:labels.manage');
Route::put('/labels/types/{type}', [LabelsController::class, 'updateType'])
    ->middleware('permission:labels.manage')
    ->whereNumber('type');
Route::delete('/labels/types/{type}', [LabelsController::class, 'destroyType'])
    ->middleware('permission:labels.manage')
    ->whereNumber('type');
Route::get('/labels/brands', [LabelsController::class, 'brands'])
    ->middleware('permission:labels.print');
Route::post('/labels/brands', [LabelsController::class, 'storeBrand'])
    ->middleware('permission:labels.manage');
Route::put('/labels/brands/{brand}', [LabelsController::class, 'updateBrand'])
    ->middleware('permission:labels.manage')
    ->whereNumber('brand');
Route::post('/labels/brands/{brand}/logo', [LabelsController::class, 'brandLogo'])
    ->middleware('permission:labels.manage')
    ->whereNumber('brand');
Route::delete('/labels/brands/{brand}', [LabelsController::class, 'destroyBrand'])
    ->middleware('permission:labels.manage')
    ->whereNumber('brand');
// Footer presets (owner, 2026-10-12: "No easy option to select and edit
// branding footer"): read with Print labels, written with Manage label settings.
Route::get('/labels/footers', [LabelsController::class, 'footers'])
    ->middleware('permission:labels.print');
Route::post('/labels/footers', [LabelsController::class, 'storeFooter'])
    ->middleware('permission:labels.manage');
Route::put('/labels/footers/{footer}', [LabelsController::class, 'updateFooter'])
    ->middleware('permission:labels.manage')
    ->whereNumber('footer');
Route::delete('/labels/footers/{footer}', [LabelsController::class, 'destroyFooter'])
    ->middleware('permission:labels.manage')
    ->whereNumber('footer');
// Custom labels: products that are not on the menu (owner, 2026-10-11: "Add
// option to add custom labels using different brands logos and other details.
// Not only from the menu list"). Printing them is labels.print; writing them,
// like an item's label wording, is labels.manage.
Route::get('/labels/custom', [LabelsController::class, 'customLabels'])
    ->middleware('permission:labels.print');
Route::post('/labels/custom', [LabelsController::class, 'storeCustomLabel'])
    ->middleware('permission:labels.manage');
// A draft custom label drawn before it is saved (2026-10-12): preview only, nothing logged.
Route::post('/labels/custom/preview', [LabelsController::class, 'previewCustomLabel'])
    ->middleware(['permission:labels.manage', 'throttle:120,1']);
Route::put('/labels/custom/{customLabel}', [LabelsController::class, 'updateCustomLabel'])
    ->middleware('permission:labels.manage')
    ->whereNumber('customLabel');
Route::post('/labels/custom/{customLabel}/picture', [LabelsController::class, 'customLabelPicture'])
    ->middleware('permission:labels.manage')
    ->whereNumber('customLabel');
Route::post('/labels/custom/{customLabel}/duplicate', [LabelsController::class, 'duplicateCustomLabel'])
    ->middleware('permission:labels.manage')
    ->whereNumber('customLabel');
Route::delete('/labels/custom/{customLabel}', [LabelsController::class, 'destroyCustomLabel'])
    ->middleware('permission:labels.manage')
    ->whereNumber('customLabel');
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
// Packed-for stickers from a wholesale delivery or a catering event (2026-10-12).
Route::get('/labels/deliveries/{delivery}/stickers', [LabelsController::class, 'deliveryStickers'])
    ->middleware('permission:labels.print')
    ->whereNumber('delivery');
Route::get('/labels/catering/{cateringRequest}/stickers', [LabelsController::class, 'cateringStickers'])
    ->middleware('permission:labels.print')
    ->whereNumber('cateringRequest');
// The ingredient glossary, English → Dhivehi (2026-10-12): read with Print labels, written with Manage label settings.
Route::get('/labels/glossary', [LabelsController::class, 'glossary'])
    ->middleware('permission:labels.print');
Route::post('/labels/glossary', [LabelsController::class, 'storeGlossary'])
    ->middleware('permission:labels.manage');
Route::put('/labels/glossary/{entry}', [LabelsController::class, 'updateGlossary'])
    ->middleware('permission:labels.manage')
    ->whereNumber('entry');
Route::delete('/labels/glossary/{entry}', [LabelsController::class, 'destroyGlossary'])
    ->middleware('permission:labels.manage')
    ->whereNumber('entry');
// Nutrition per 100 g of each ingredient (round C, 2026-10-12): read with Print labels, written with Manage label settings.
Route::get('/labels/nutrition', [LabelsController::class, 'nutrition'])
    ->middleware('permission:labels.print');
Route::put('/labels/nutrition/{inventoryItem}', [LabelsController::class, 'updateNutrition'])
    ->middleware('permission:labels.manage')
    ->whereNumber('inventoryItem');
// Label templates (round 7, 2026-10-13: "Start from a saved label or a built-in
// template; Save as template from any label"): read with Print labels, written
// with Manage label settings, as the custom labels they start.
Route::get('/labels/templates', [LabelsController::class, 'templates'])
    ->middleware('permission:labels.print');
Route::post('/labels/templates', [LabelsController::class, 'storeTemplate'])
    ->middleware('permission:labels.manage');
Route::put('/labels/templates/{template}', [LabelsController::class, 'updateTemplate'])
    ->middleware('permission:labels.manage')
    ->whereNumber('template');
Route::delete('/labels/templates/{template}', [LabelsController::class, 'destroyTemplate'])
    ->middleware('permission:labels.manage')
    ->whereNumber('template');
// Scan to reprint (round 11, 2026-10-13: "scan a pack's QR with the phone and
// reprint that exact label"): a print by the code on its stickers, with the
// request that prints it again. Read with Print labels, as the print log is.
Route::get('/labels/prints/{code}', [LabelsController::class, 'print'])
    ->middleware('permission:labels.print')
    ->where('code', '[A-Za-z0-9]{4,12}');
// The wording lock (round 17, 2026-10-13: "a wording lock with sign-off for
// legal lines"): where each product's legal lines stand is read with Print
// labels; signing them off is Manage label settings, as the wording itself.
Route::get('/labels/signoffs', [LabelsController::class, 'signoffs'])
    ->middleware('permission:labels.print');
Route::get('/labels/signoffs/{kind}/{id}', [LabelsController::class, 'signoffStatus'])
    ->middleware('permission:labels.print')
    ->whereIn('kind', ['item', 'custom'])->whereNumber('id');
Route::get('/labels/signoffs/{kind}/{id}/history', [LabelsController::class, 'signoffHistory'])
    ->middleware('permission:labels.print')
    ->whereIn('kind', ['item', 'custom'])->whereNumber('id');
Route::post('/labels/signoffs/{kind}/{id}', [LabelsController::class, 'signOff'])
    ->middleware('permission:labels.manage')
    ->whereIn('kind', ['item', 'custom'])->whereNumber('id');
