<?php

declare(strict_types=1);

use App\Http\Controllers\Api\ComplaintController;
use Illuminate\Support\Facades\Route;

/*
| Staff complaint queue — owner-only permissions by default.
*/

Route::get('/complaints', [ComplaintController::class, 'index'])
    ->middleware('permission:complaints.view');
Route::get('/complaints/{id}', [ComplaintController::class, 'show'])
    ->middleware('permission:complaints.view')
    ->whereNumber('id');
Route::patch('/complaints/{id}/status', [ComplaintController::class, 'updateStatus'])
    ->middleware('permission:complaints.manage')
    ->whereNumber('id');
Route::post('/complaints/{id}/contact-logs', [ComplaintController::class, 'addContactLog'])
    ->middleware('permission:complaints.manage')
    ->whereNumber('id');
Route::get('/complaints/{id}/photo', [\App\Http\Controllers\Api\ComplaintPhotoController::class, 'showStaff'])
    ->middleware('permission:complaints.view')
    ->whereNumber('id');
