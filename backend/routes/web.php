<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\ImageThumbController;
use App\Http\Controllers\MenuAdminController;
use App\Http\Controllers\ReceiptPageController;

// Thumbnails for local cafe images (faster load)
Route::get('/thumb/{path}', [ImageThumbController::class, 'show'])
    ->where('path', '.*')
    ->name('thumb');

// Dashboard (redirect to home - no separate dashboard yet)
Route::get('/dashboard', function () {
    return redirect()->route('home');
})->name('dashboard');

// Menu admin (add/delete items) - staff login on page
Route::get('/admin', [MenuAdminController::class, 'index'])->name('admin.menu');

// Public Website Pages (Customer-facing only)
Route::get('/', [HomeController::class, 'index'])->name('home');
Route::get('/menu', [HomeController::class, 'menu'])->name('menu');
Route::get('/contact', [HomeController::class, 'contact'])->name('contact');
Route::get('/hours', [HomeController::class, 'hours'])->name('hours');
Route::get('/privacy', [HomeController::class, 'privacy'])->name('privacy');

// Customer Portal (Web Login)
use App\Http\Controllers\CustomerPortalController;
Route::get('/customer/login', [CustomerPortalController::class, 'showLogin'])->name('customer.login');
Route::post('/customer/request-otp', [CustomerPortalController::class, 'requestOtp'])->name('customer.request-otp');
Route::post('/customer/verify-otp', [CustomerPortalController::class, 'verifyOtp'])->name('customer.verify-otp');
Route::post('/customer/logout', [CustomerPortalController::class, 'logout'])->name('customer.logout');

// Order Type Selection (Gateway)
Route::get('/order-type', function() {
    return view('order-type-select');
})->name('order.type');

// Checkout (from main menu)
Route::get('/checkout', [HomeController::class, 'checkout'])->name('checkout');

// Pre-Orders (Event Orders)
use App\Http\Controllers\PreOrderController;
Route::get('/pre-order', [PreOrderController::class, 'create'])->name('pre-order.create');
Route::post('/pre-order', [PreOrderController::class, 'store'])->name('pre-order.store');
Route::get('/pre-order/{id}/confirmation', [PreOrderController::class, 'confirmation'])->name('pre-order.confirmation');

// Receipt pages
Route::get('/receipts/{token}', [ReceiptPageController::class, 'show'])->name('receipts.show');
Route::get('/receipts/{token}/pdf', [ReceiptPageController::class, 'pdf'])->name('receipts.pdf');
Route::post('/receipts/{token}/feedback', [ReceiptPageController::class, 'feedback'])->name('receipts.feedback');
Route::post('/receipts/{token}/resend', [ReceiptPageController::class, 'resend'])->name('receipts.resend');
