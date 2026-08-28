<?php

declare(strict_types=1);

require __DIR__ . '/_helpers.php';

use App\Http\Controllers\Api\SocialChannelController;
use App\Http\Controllers\Api\SocialPostController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Social Hub — posting the business's content to its own social accounts
|--------------------------------------------------------------------------
| Loaded inside the auth:sanctum + staff.token group. Viewing needs
| social.view; the composer checks compose/schedule/publish per action;
| channel management (credentials that post as the business) is owner-only.
*/

if (routes_domain_section_is('social', 'public') && !routes_domain_loaded('social.public')) {
    routes_domain_mark_loaded('social.public');

    // Viber webhook: Viber requires one registered before its post API works.
    // Signature-verified in-controller (HMAC of raw body with the channel
    // token); no side effects, narrowly scoped, throttled.
    Route::post('/social/viber/webhook', [App\Http\Controllers\Api\SocialViberWebhookController::class, 'handle'])
        ->middleware('throttle:60,1');
}

if (routes_domain_section_is('social', 'admin') && !routes_domain_loaded('social.admin')) {
    routes_domain_mark_loaded('social.admin');

    Route::middleware('permission:social.view')->prefix('admin/social')->group(function () {
        Route::get('/channel-options', [SocialPostController::class, 'channelOptions']);
        Route::get('/posts', [SocialPostController::class, 'index']);
        Route::get('/posts/{id}', [SocialPostController::class, 'show']);
        // Finer slugs (compose/schedule/publish) are enforced in-controller
        // because one endpoint serves draft/schedule/now.
        Route::post('/posts', [SocialPostController::class, 'store']);
        Route::post('/posts/{id}/publish', [SocialPostController::class, 'publishNow']);
        Route::post('/posts/{id}/cancel', [SocialPostController::class, 'cancel']);
        Route::post('/posts/{id}/deliveries/{deliveryId}/retry', [SocialPostController::class, 'retryDelivery']);
        // Automation settings: read with social.view; writes check
        // social.publish in-controller (they decide what auto-publishes).
        Route::get('/automation', [SocialPostController::class, 'automationSettings']);
        Route::put('/automation', [SocialPostController::class, 'updateAutomationSettings']);
        // Video renditions: list with social.view; generate/delete check
        // social.compose in-controller.
        Route::get('/items/{id}/videos', [App\Http\Controllers\Api\SocialVideoController::class, 'index']);
        Route::post('/items/{id}/videos', [App\Http\Controllers\Api\SocialVideoController::class, 'store']);
        Route::delete('/videos/{renditionId}', [App\Http\Controllers\Api\SocialVideoController::class, 'destroy']);
    });

    Route::middleware('permission:social.channels.manage')->prefix('admin/social')->group(function () {
        Route::get('/channels', [SocialChannelController::class, 'index']);
        Route::post('/channels', [SocialChannelController::class, 'store']);
        Route::patch('/channels/{id}', [SocialChannelController::class, 'update']);
        Route::delete('/channels/{id}', [SocialChannelController::class, 'destroy']);
        Route::post('/channels/{id}/test', [SocialChannelController::class, 'testPost']);
    });
}
