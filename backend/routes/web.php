<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\OpeningSoonController;
use App\Http\Controllers\ReceiptPageController;

// Opening Soon Page - Main route
Route::get('/', [OpeningSoonController::class, 'index'])->name('home');

// Color Scheme Pages
Route::get('/color-scheme-1', [OpeningSoonController::class, 'colorScheme1'])->name('color-scheme-1');
Route::get('/color-scheme-2', [OpeningSoonController::class, 'colorScheme2'])->name('color-scheme-2');
Route::get('/color-scheme-3', [OpeningSoonController::class, 'colorScheme3'])->name('color-scheme-3');
Route::get('/color-scheme-4', [OpeningSoonController::class, 'colorScheme4'])->name('color-scheme-4');
Route::get('/color-scheme-5', [OpeningSoonController::class, 'colorScheme5'])->name('color-scheme-5');
Route::get('/color-scheme-6', [OpeningSoonController::class, 'colorScheme6'])->name('color-scheme-6');
Route::get('/color-scheme-7', [OpeningSoonController::class, 'colorScheme7'])->name('color-scheme-7');
Route::get('/color-scheme-8', [OpeningSoonController::class, 'colorScheme8'])->name('color-scheme-8');

// Receipt pages
Route::get('/receipts/{token}', [ReceiptPageController::class, 'show'])->name('receipts.show');
Route::get('/receipts/{token}/pdf', [ReceiptPageController::class, 'pdf'])->name('receipts.pdf');
Route::post('/receipts/{token}/feedback', [ReceiptPageController::class, 'feedback'])->name('receipts.feedback');
Route::post('/receipts/{token}/resend', [ReceiptPageController::class, 'resend'])->name('receipts.resend');
