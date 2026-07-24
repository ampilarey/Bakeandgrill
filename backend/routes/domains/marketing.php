<?php

declare(strict_types=1);

require __DIR__ . '/_helpers.php';

use App\Http\Controllers\Api\SmsPromotionController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Promotions, SMS campaigns, referrals, gift cards, and push notifications
|--------------------------------------------------------------------------
| SMS promotions block: loaded inside auth:sanctum + staff.token group.
| Remaining marketing routes: loaded at top level.
*/

if (routes_domain_section_is_or_unset('marketing', 'sms_promotions', 'sms_promotions') && !routes_domain_loaded('marketing.sms_promotions')) {
    routes_domain_mark_loaded('marketing.sms_promotions');

    // SMS promotions — preview/list for marketing staff; send is manager-only
    Route::get('/sms/promotions', [SmsPromotionController::class, 'index'])
        ->middleware('permission:sms.campaigns.send');
    Route::get('/sms/promotions/{id}', [SmsPromotionController::class, 'show'])
        ->middleware('permission:sms.campaigns.send');
    Route::post('/sms/promotions/preview', [SmsPromotionController::class, 'preview'])
        ->middleware(['permission:sms.campaigns.send', 'throttle:10,5']);
    Route::post('/sms/promotions/send', [SmsPromotionController::class, 'send'])
        ->middleware(['permission:sms.campaigns.send', 'throttle:5,60']);
}

if (routes_domain_section_is('marketing', 'public') && !routes_domain_loaded('marketing.public')) {
    routes_domain_mark_loaded('marketing.public');

    // ─── Promotions ──────────────────────────────────────────────────────────────
    // Public/customer — validate a code
    Route::post('/promotions/validate', [App\Http\Controllers\Api\PromotionController::class, 'validate'])
        ->middleware('throttle:20,1');

    // Apply/remove promo — requires auth; authorization matrix enforced in the controller:
    //   - Customer token: may only modify their own order (IDOR check)
    //   - Staff token: requires promotions.discounts permission (checked in controller)
    //   - Unauthenticated: rejected by auth:sanctum
    Route::middleware(['auth:sanctum', 'staff_or_customer.token'])->group(function () {
        Route::post('/orders/{orderId}/apply-promo', [App\Http\Controllers\Api\PromotionController::class, 'applyToOrder']);
        Route::delete('/orders/{orderId}/promo/{promotionId}', [App\Http\Controllers\Api\PromotionController::class, 'removeFromOrder']);
    });

    // Admin — full CRUD (requires promotions.manage permission)
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:promotions.manage'])->prefix('admin')->group(function () {
        Route::get('/promotions', [App\Http\Controllers\Api\PromotionController::class, 'adminIndex']);
        Route::post('/promotions', [App\Http\Controllers\Api\PromotionController::class, 'adminStore']);
        Route::patch('/promotions/{id}', [App\Http\Controllers\Api\PromotionController::class, 'adminUpdate']);
        Route::delete('/promotions/{id}', [App\Http\Controllers\Api\PromotionController::class, 'adminDestroy']);
        Route::get('/reports/promotions', [App\Http\Controllers\Api\PromotionController::class, 'adminReport']);
    });

    // ─── Marketing: Referrals & Gift Cards ───────────────────────────────────────
    // Public: validate referral code
    Route::post('/referrals/validate', [App\Http\Controllers\Api\ReferralController::class, 'validate'])
        ->middleware('throttle:30,1');

    // Public: gift card balance check + SMS view link (token, not the card code).
    // Balance is POST-only — code in the URL would hit access logs.
    Route::post('/gift-cards/balance', [App\Http\Controllers\Api\GiftCardController::class, 'balancePost'])
        ->middleware('throttle:10,1');
    Route::get('/gift-cards/view/{token}', [App\Http\Controllers\Api\GiftCardController::class, 'viewByToken'])
        ->middleware('throttle:30,1')
        ->where('token', '[A-Za-z0-9]{32,64}');

    // Customer: referral management + gift card on orders
    Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
        Route::get('/customer/referral-code', [App\Http\Controllers\Api\ReferralController::class, 'myCode']);
        Route::post('/gift-cards/purchase', [App\Http\Controllers\Api\GiftCardController::class, 'purchase'])
            ->middleware('throttle:5,10');
        Route::get('/gift-cards/purchases/{orderId}', [App\Http\Controllers\Api\GiftCardController::class, 'purchaseStatus']);
        Route::post('/gift-cards/purchases/{orderId}/resend', [App\Http\Controllers\Api\GiftCardController::class, 'resendPurchaseDelivery'])
            ->middleware('throttle:5,10');
        Route::post('/orders/{orderId}/apply-gift-card', [App\Http\Controllers\Api\GiftCardController::class, 'applyToOrder']);
        Route::delete('/orders/{orderId}/gift-card', [App\Http\Controllers\Api\GiftCardController::class, 'removeFromOrder']);
        Route::post('/orders/{orderId}/apply-referral', [App\Http\Controllers\Api\ReferralController::class, 'applyToOrder']);
        Route::delete('/orders/{orderId}/referral', [App\Http\Controllers\Api\ReferralController::class, 'removeFromOrder']);
    });

    // Admin: gift cards and referral overview
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:promotions.manage'])->group(function () {
        Route::get('/admin/gift-cards', [App\Http\Controllers\Api\GiftCardController::class, 'index']);
        Route::post('/admin/gift-cards', [App\Http\Controllers\Api\GiftCardController::class, 'issue']);
        Route::post('/admin/gift-cards/send-sms', [App\Http\Controllers\Api\GiftCardController::class, 'sendSms'])
            ->middleware('throttle:10,1');
        Route::post('/admin/gift-cards/send-email', [App\Http\Controllers\Api\GiftCardController::class, 'sendEmail'])
            ->middleware('throttle:10,1');
        Route::get('/admin/gift-cards/{id}/transactions', [App\Http\Controllers\Api\GiftCardController::class, 'transactions']);
        Route::post('/admin/gift-cards/{id}/cancel', [App\Http\Controllers\Api\GiftCardController::class, 'cancel']);
        Route::post('/admin/gift-cards/{id}/top-up', [App\Http\Controllers\Api\GiftCardController::class, 'topUp']);
        Route::patch('/admin/gift-cards/{id}/expiry', [App\Http\Controllers\Api\GiftCardController::class, 'extendExpiry']);
        Route::get('/admin/referrals', [App\Http\Controllers\Api\ReferralController::class, 'adminIndex']);
        Route::patch('/admin/referrals/{id}', [App\Http\Controllers\Api\ReferralController::class, 'update']);
        Route::get('/admin/marketing/automation', [App\Http\Controllers\Api\AdminMarketingAutomationController::class, 'show']);
        Route::patch('/admin/marketing/automation', [App\Http\Controllers\Api\AdminMarketingAutomationController::class, 'update']);
    });

    // Owner-only: discount cards (unique codes; redeem via existing promo path)
    Route::middleware(['auth:sanctum', 'staff.token', 'permission:promotions.discount_cards'])->group(function () {
        Route::get('/admin/discount-cards/batches', [App\Http\Controllers\Api\DiscountCardController::class, 'indexBatches']);
        Route::post('/admin/discount-cards/batches', [App\Http\Controllers\Api\DiscountCardController::class, 'issue']);
        Route::get('/admin/discount-cards/batches/{id}', [App\Http\Controllers\Api\DiscountCardController::class, 'showBatch']);
        Route::post('/admin/discount-cards/{id}/void', [App\Http\Controllers\Api\DiscountCardController::class, 'voidCard']);
    });

    Route::middleware(['auth:sanctum', 'staff.token', 'permission:customers.analytics'])->group(function () {
        Route::get('/admin/marketing/item-pairs', [App\Http\Controllers\Api\ItemPairAdminController::class, 'index']);
    });

    // ─── Push Notification Subscriptions ─────────────────────────────────────────
    // Public: VAPID public key for subscription setup (no auth needed)
    Route::get('/push/vapid-key', [App\Http\Controllers\Api\PushSubscriptionController::class, 'vapidKey']);

    Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
        Route::post('/push/subscribe', [App\Http\Controllers\Api\PushSubscriptionController::class, 'subscribe'])
            ->middleware('throttle:5,1');
        Route::post('/push/unsubscribe', [App\Http\Controllers\Api\PushSubscriptionController::class, 'unsubscribe'])
            ->middleware('throttle:5,1');
    });

    // ─── Favorites & Quick Reorder ───────────────────────────────────────────────
    Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
        Route::get('/customer/favorites', [App\Http\Controllers\Api\FavoritesController::class, 'index']);
        Route::post('/customer/favorites/{itemId}/toggle', [App\Http\Controllers\Api\FavoritesController::class, 'toggle']);
        Route::get('/customer/orders/{orderId}/reorder', [App\Http\Controllers\Api\FavoritesController::class, 'reorder']);
    });

    // ─── Pre-Orders (historical read-only; new requests use /catering-requests) ──
    Route::middleware(['auth:sanctum', 'customer.token'])->group(function () {
        Route::get('/customer/pre-orders', [App\Http\Controllers\Api\PreOrderApiController::class, 'index']);
    });
}

if (routes_domain_section_is('marketing', 'sms_admin') && !routes_domain_loaded('marketing.sms_admin')) {
    routes_domain_mark_loaded('marketing.sms_admin');

    // ─── SMS Campaigns + Logs (Admin) ────────────────────────────────────────────
    Route::middleware(['auth:sanctum', 'staff.token'])->prefix('admin/sms')->group(function () {
        // Control Center
        Route::get('/control-center', [App\Http\Controllers\Api\SmsControlCenterController::class, 'index']);
        Route::patch('/types/{key}', [App\Http\Controllers\Api\SmsControlCenterController::class, 'updateType'])
            ->middleware('permission:sms.settings.manage');
        Route::patch('/global-kill-switch', [App\Http\Controllers\Api\SmsControlCenterController::class, 'updateGlobalKillSwitch'])
            ->middleware('permission:sms.settings.manage');

        // Full SMS audit log (OTP + promo + campaign + transactional)
        Route::middleware('permission:sms.logs.view')->group(function () {
            Route::get('/logs', [App\Http\Controllers\Api\SmsCampaignController::class, 'logs']);
            Route::get('/logs/stats', [App\Http\Controllers\Api\SmsCampaignController::class, 'logStats']);
            Route::get('/staff-logs', [App\Http\Controllers\Api\StaffNotificationLogController::class, 'index']);
            Route::post('/staff-logs/{id}/resend', [App\Http\Controllers\Api\StaffNotificationLogController::class, 'resend']);
        });

        // Bulk SMS campaigns
        Route::middleware('permission:sms.campaigns.send')->group(function () {
            Route::get('/campaigns', [App\Http\Controllers\Api\SmsCampaignController::class, 'index']);
            Route::post('/campaigns', [App\Http\Controllers\Api\SmsCampaignController::class, 'store']);
            Route::post('/campaigns/preview', [App\Http\Controllers\Api\SmsCampaignController::class, 'preview']);
            Route::get('/campaigns/{campaign}', [App\Http\Controllers\Api\SmsCampaignController::class, 'show']);
            Route::post('/campaigns/{campaign}/send', [App\Http\Controllers\Api\SmsCampaignController::class, 'send']);
            Route::post('/campaigns/{campaign}/cancel', [App\Http\Controllers\Api\SmsCampaignController::class, 'cancel']);
        });

        // SMS Contacts & Groups
        Route::middleware('permission:sms.contacts.manage')->group(function () {
            Route::get('/contacts', [App\Http\Controllers\Api\SmsContactController::class, 'index']);
            Route::post('/contacts', [App\Http\Controllers\Api\SmsContactController::class, 'store']);
            Route::patch('/contacts/{id}', [App\Http\Controllers\Api\SmsContactController::class, 'update']);
            Route::delete('/contacts/{id}', [App\Http\Controllers\Api\SmsContactController::class, 'destroy']);

            Route::get('/contact-groups', [App\Http\Controllers\Api\SmsContactGroupController::class, 'index']);
            Route::post('/contact-groups', [App\Http\Controllers\Api\SmsContactGroupController::class, 'store']);
            Route::patch('/contact-groups/{id}', [App\Http\Controllers\Api\SmsContactGroupController::class, 'update']);
            Route::delete('/contact-groups/{id}', [App\Http\Controllers\Api\SmsContactGroupController::class, 'destroy']);
            Route::post('/contact-groups/{id}/members', [App\Http\Controllers\Api\SmsContactGroupController::class, 'addMember']);
            Route::delete('/contact-groups/{id}/members/{contactId}', [App\Http\Controllers\Api\SmsContactGroupController::class, 'removeMember']);
        });

        // SMS Templates
        Route::middleware('permission:sms.templates.edit')->group(function () {
            Route::get('/templates', [App\Http\Controllers\Api\SmsTemplateController::class, 'index']);
            Route::post('/templates', [App\Http\Controllers\Api\SmsTemplateController::class, 'store']);
            Route::patch('/templates/{id}', [App\Http\Controllers\Api\SmsTemplateController::class, 'update']);
            Route::delete('/templates/{id}', [App\Http\Controllers\Api\SmsTemplateController::class, 'destroy']);
            Route::post('/templates/{id}/preview', [App\Http\Controllers\Api\SmsTemplateController::class, 'preview']);
        });

        // Scheduled Messages
        Route::middleware('permission:sms.scheduled.manage')->group(function () {
            Route::get('/scheduled', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'index']);
            Route::post('/scheduled', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'store']);
            Route::patch('/scheduled/{id}', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'update']);
            Route::delete('/scheduled/{id}', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'destroy']);
            Route::post('/scheduled/{id}/pause', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'pause']);
            Route::post('/scheduled/{id}/resume', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'resume']);
        });
    });
}
