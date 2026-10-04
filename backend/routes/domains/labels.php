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
