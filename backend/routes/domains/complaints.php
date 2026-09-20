<?php

declare(strict_types=1);

use App\Http\Controllers\Api\ComplaintBoxController;
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
Route::get('/complaints/{id}/photo', [App\Http\Controllers\Api\ComplaintPhotoController::class, 'showStaff'])
    ->middleware('permission:complaints.view')
    ->whereNumber('id');
Route::post('/complaints/{id}/link-refund', [ComplaintController::class, 'linkRefund'])
    ->middleware('permission:complaints.manage')
    ->whereNumber('id');

/*
| The complaint box — staff, food and service complaints from the public form
| (owner, 2026-09-19). Same two permissions as the receipt complaints.
*/
Route::get('/complaint-box', [ComplaintBoxController::class, 'index'])
    ->middleware('permission:complaints.view');
// Phase B (owner, 2026-09-21): complaints per named staff member, and the
// alert switches. Static paths before /{id}.
Route::get('/complaint-box/by-staff', [ComplaintBoxController::class, 'byStaff'])
    ->middleware('permission:complaints.view');
Route::get('/complaint-box/alert-settings', [ComplaintBoxController::class, 'alertSettings'])
    ->middleware('permission:complaints.manage');
Route::patch('/complaint-box/alert-settings', [ComplaintBoxController::class, 'updateAlertSettings'])
    ->middleware('permission:complaints.manage');
Route::get('/complaint-box/{id}', [ComplaintBoxController::class, 'show'])
    ->middleware('permission:complaints.view')
    ->whereNumber('id');
Route::patch('/complaint-box/{id}/status', [ComplaintBoxController::class, 'updateStatus'])
    ->middleware('permission:complaints.manage')
    ->whereNumber('id');
Route::post('/complaint-box/{id}/message', [ComplaintBoxController::class, 'message'])
    ->middleware('permission:complaints.manage')
    ->whereNumber('id');
