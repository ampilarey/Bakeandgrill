<?php

declare(strict_types=1);

use App\Http\Controllers\HomeController;
use App\Http\Controllers\ImageThumbController;
use App\Http\Controllers\MenuAdminController;
use App\Http\Controllers\ReceiptPageController;
use Illuminate\Support\Facades\Route;

// Thumbnails for local cafe images (faster load)
Route::get('/thumb/{path}', [ImageThumbController::class, 'show'])
    ->where('path', '.*')
    ->name('thumb');

// Dashboard (redirect to home - no separate dashboard yet)
Route::get('/dashboard', function () {
    return redirect()->route('home');
})->name('dashboard');

// Old Blade admin — redirect to React SPA
Route::get('/admin', function () {
    return redirect('/admin/');
})->name('admin.redirect');

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
Route::get('/order-type', function () {
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

// BML Return URL (non-authoritative — redirects to frontend)
Route::get('/payments/bml/return', [App\Http\Controllers\Api\PaymentController::class, 'bmlReturn'])->name('bml.return');

// Online Order SPA — redirect bare /order to /order/ then catch-all for React Router
Route::get('/order', function () {
    return redirect('/order/');
})->name('order.redirect');
Route::get('/order/{any}', function () {
    return response()->file(public_path('order/index.html'));
})->where('any', '.*')->name('order.spa');

// Admin Dashboard SPA — catch-all for /admin/* sub-paths
Route::get('/admin/{any}', function () {
    return response()->file(public_path('admin/index.html'));
})->where('any', '.*')->name('admin.spa');
