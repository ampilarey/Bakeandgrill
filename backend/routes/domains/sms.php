// ─── SMS Campaigns + Logs (Admin) ────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token', 'permission:integrations.sms'])->prefix('admin/sms')->group(function () {
    // Full SMS audit log (OTP + promo + campaign + transactional)
    Route::get('/logs', [App\Http\Controllers\Api\SmsCampaignController::class, 'logs']);
    Route::get('/logs/stats', [App\Http\Controllers\Api\SmsCampaignController::class, 'logStats']);

    // Bulk SMS campaigns
    Route::get('/campaigns', [App\Http\Controllers\Api\SmsCampaignController::class, 'index']);
    Route::post('/campaigns', [App\Http\Controllers\Api\SmsCampaignController::class, 'store']);
    Route::post('/campaigns/preview', [App\Http\Controllers\Api\SmsCampaignController::class, 'preview']);
    Route::get('/campaigns/{campaign}', [App\Http\Controllers\Api\SmsCampaignController::class, 'show']);
    Route::post('/campaigns/{campaign}/send', [App\Http\Controllers\Api\SmsCampaignController::class, 'send']);
    Route::post('/campaigns/{campaign}/cancel', [App\Http\Controllers\Api\SmsCampaignController::class, 'cancel']);

    // SMS Contacts & Groups
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

    // SMS Templates
    Route::get('/templates', [App\Http\Controllers\Api\SmsTemplateController::class, 'index']);
    Route::post('/templates', [App\Http\Controllers\Api\SmsTemplateController::class, 'store']);
    Route::patch('/templates/{id}', [App\Http\Controllers\Api\SmsTemplateController::class, 'update']);
    Route::delete('/templates/{id}', [App\Http\Controllers\Api\SmsTemplateController::class, 'destroy']);
    Route::post('/templates/{id}/preview', [App\Http\Controllers\Api\SmsTemplateController::class, 'preview']);

    // Scheduled Messages
    Route::get('/scheduled', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'index']);
    Route::post('/scheduled', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'store']);
    Route::patch('/scheduled/{id}', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'update']);
    Route::delete('/scheduled/{id}', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'destroy']);
    Route::post('/scheduled/{id}/pause', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'pause']);
    Route::post('/scheduled/{id}/resume', [App\Http\Controllers\Api\SmsScheduledMessageController::class, 'resume']);

    // Staff notification logs
    Route::get('/staff-logs', [App\Http\Controllers\Api\StaffNotificationLogController::class, 'index']);
    Route::post('/staff-logs/{id}/resend', [App\Http\Controllers\Api\StaffNotificationLogController::class, 'resend']);
});

// ─── Staff Notification Preferences ──────────────────────────────────────────
Route::middleware(['auth:sanctum', 'staff.token', 'permission:staff.update'])->group(function () {
    Route::get('/admin/staff/{userId}/notification-prefs', [App\Http\Controllers\Api\StaffNotificationPrefController::class, 'show']);
    Route::put('/admin/staff/{userId}/notification-prefs', [App\Http\Controllers\Api\StaffNotificationPrefController::class, 'update']);
});

