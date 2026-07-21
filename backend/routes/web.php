<?php

declare(strict_types=1);

use App\Http\Controllers\HomeController;
use App\Http\Controllers\ImageThumbController;
use App\Http\Controllers\InvoicePageController;
use App\Http\Controllers\PosPayPageController;
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

// Prayer Times standalone page
use App\Http\Controllers\PrayerTimesWebController;

Route::get('/prayer-times', [PrayerTimesWebController::class, 'index'])->name('prayer-times.index');

// Public Website Pages (Customer-facing only)
// `service.banner` shares $serviceBanner with layout.blade.php and returns the
// branded maintenance view (503) when the `marketing_site` service key is off.
Route::middleware('service.banner')->group(function () {
    Route::get('/', [HomeController::class, 'index'])->name('home');
    Route::get('/contact', [HomeController::class, 'contact'])->name('contact');
    Route::get('/hours', [HomeController::class, 'hours'])->name('hours');
    Route::get('/terms', [HomeController::class, 'terms'])->name('terms');
    Route::get('/refund', [HomeController::class, 'refund'])->name('refund');
});
Route::redirect('/menu', '/order/menu', 301)->name('menu');
Route::redirect('/privacy', '/order/privacy', 301)->name('privacy');

// Customer Portal (Web Login)
use App\Http\Controllers\CustomerPortalController;

Route::get('/customer/login', [CustomerPortalController::class, 'showLogin'])->name('customer.login');
Route::post('/customer/request-otp', [CustomerPortalController::class, 'requestOtp'])->name('customer.request-otp');
Route::get('/customer/verify-otp', [CustomerPortalController::class, 'showVerifyOtp'])->name('customer.verify-otp.show');
Route::post('/customer/verify-otp', [CustomerPortalController::class, 'verifyOtp'])->name('customer.verify-otp');
Route::post('/customer/login', [CustomerPortalController::class, 'passwordLogin'])->name('customer.password-login');
Route::post('/customer/logout', [CustomerPortalController::class, 'logout'])->name('customer.logout');

// Called by the React order app after login to establish a Blade session
// (so the main website header shows "Hi, [phone]" immediately).
// Protected by Sanctum Bearer token instead of CSRF — no form token needed.
Route::post('/customer/sync-session', [CustomerPortalController::class, 'syncSession'])
    ->withoutMiddleware([Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class])
    ->middleware(['auth:sanctum', 'customer.token'])
    ->name('customer.sync-session');

// Profile setup — redirect to login if not authenticated
Route::get('/customer/complete-profile', [CustomerPortalController::class, 'showCompleteProfile'])->name('customer.complete-profile');
Route::post('/customer/complete-profile', [CustomerPortalController::class, 'completeProfile'])->name('customer.complete-profile.post');

// Forgot / reset password via OTP
Route::get('/customer/forgot-password', [CustomerPortalController::class, 'showForgotPassword'])->name('customer.forgot-password');
Route::post('/customer/forgot-password', [CustomerPortalController::class, 'forgotPassword'])->name('customer.forgot-password.post');
Route::post('/customer/verify-reset-otp', [CustomerPortalController::class, 'verifyResetOtp'])->name('customer.verify-reset-otp');
Route::post('/customer/reset-password', [CustomerPortalController::class, 'resetPassword'])->name('customer.reset-password');

// Legacy redirects — these pages now live in the React order app
Route::redirect('/order-type', '/order/', 301);
Route::redirect('/checkout', '/order/', 301);

// Catering & events — wizard lives at /order/events (pre-order confirmation IDOR retired)
Route::redirect('/pre-order', '/order/events', 301)->name('pre-order.create');
Route::redirect('/order/pre-order', '/order/events', 301);
Route::post('/pre-order', function () {
    return redirect('/order/events', 301);
})->name('pre-order.store');

// Receipt pages
Route::get('/receipts/{token}', [ReceiptPageController::class, 'show'])->name('receipts.show');
Route::get('/receipts/{token}/pdf', [ReceiptPageController::class, 'pdf'])->name('receipts.pdf');
Route::post('/receipts/{token}/feedback', [ReceiptPageController::class, 'feedback'])->name('receipts.feedback');

// POS pay page — order review + terms before BML redirect (token = receipt token)
Route::get('/pay/{token}', [PosPayPageController::class, 'show'])->name('pos-pay.show');
Route::post('/pay/{token}', [PosPayPageController::class, 'pay'])
    ->middleware('throttle:10,1')
    ->name('pos-pay.pay');

// Invoice public pages (no auth — token-gated)
Route::get('/invoices/{token}', [InvoicePageController::class, 'show'])->name('invoices.show');
Route::get('/invoices/{token}/pdf', [InvoicePageController::class, 'pdf'])->name('invoices.pdf');

// BML Return URL (non-authoritative — redirects to frontend)
Route::get('/payments/bml/return', [App\Http\Controllers\Api\PaymentController::class, 'bmlReturn'])->name('bml.return');

// Online Order SPA — redirect bare /order to /order/ then catch-all for React Router
Route::get('/order', function () {
    return redirect('/order/');
})->name('order.redirect');

// Specific paths inside /order/* that should resolve to their canonical Blade/static equivalents
// These must be declared BEFORE the catch-all to take precedence.
Route::redirect('/order/refund-policy', '/refund', 301);
Route::redirect('/order/refund', '/refund', 301);
Route::redirect('/order/terms-and-conditions', '/terms', 301);
Route::redirect('/order/terms', '/terms', 301);

// Short SMS links → order SPA track route (path token survives SMS clients).
Route::redirect('/t/{token}', '/order/track/{token}', 301)
    ->where('token', '[A-Za-z0-9]+')
    ->name('order.track.short');

// POS version manifest — must never be cached (iPad PWA update checks).
Route::get('/pos-version.json', function () {
    $path = public_path('pos/pos-version.json');
    abort_unless(is_file($path), 404, 'POS version file not deployed.');

    return response(file_get_contents($path), 200, [
        'Content-Type' => 'application/json; charset=utf-8',
        'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma' => 'no-cache',
        'Expires' => '0',
    ]);
})->name('pos.version');

// Order SPA — includes /order/track/{token} (SMS) and /order/orders/{id}.
Route::get('/order/{any}', function () {
    $path = public_path('order/index.html');
    abort_if(!file_exists($path), 503, 'Order app not deployed.');

    return response(file_get_contents($path), 200, [
        'Content-Type' => 'text/html; charset=utf-8',
        'Cache-Control' => 'no-store, no-cache, must-revalidate',
    ]);
})->where('any', '.*')->name('order.spa');

// Admin Dashboard SPA — catch-all for /admin/* sub-paths
Route::get('/admin/{any}', function () {
    $path = public_path('admin/index.html');
    abort_if(!file_exists($path), 503, 'Admin app not deployed.');

    return response(file_get_contents($path), 200, [
        'Content-Type' => 'text/html; charset=utf-8',
        'Cache-Control' => 'no-store, no-cache, must-revalidate',
    ]);
})->where('any', '.*')->name('admin.spa');

// KDS SPA — catch-all for /kds/* sub-paths
Route::get('/kds', function () {
    return redirect('/kds/');
})->name('kds.redirect');
Route::get('/kds/{any}', function () {
    $path = public_path('kds/index.html');
    abort_if(!file_exists($path), 503, 'KDS app not deployed.');

    return response(file_get_contents($path), 200, [
        'Content-Type' => 'text/html; charset=utf-8',
        'Cache-Control' => 'no-store, no-cache, must-revalidate',
    ]);
})->where('any', '.*')->name('kds.spa');

// POS SPA — catch-all for /pos/* sub-paths
Route::get('/pos', function () {
    return redirect('/pos/');
})->name('pos.redirect');
Route::get('/pos/{any}', function () {
    $path = public_path('pos/index.html');
    abort_if(!file_exists($path), 503, 'POS app not deployed.');

    return response(file_get_contents($path), 200, [
        'Content-Type' => 'text/html; charset=utf-8',
        'Cache-Control' => 'no-store, no-cache, must-revalidate',
    ]);
})->where('any', '.*')->name('pos.spa');

// Driver PWA SPA — catch-all for /driver/* sub-paths
Route::get('/driver', function () {
    return redirect('/driver/');
})->name('driver.redirect');
Route::get('/driver/{any}', function () {
    $path = public_path('driver/index.html');
    abort_if(!file_exists($path), 503, 'Driver app not deployed.');

    return response(file_get_contents($path), 200, [
        'Content-Type' => 'text/html; charset=utf-8',
        'Cache-Control' => 'no-store, no-cache, must-revalidate',
    ]);
})->where('any', '.*')->name('driver.spa');
