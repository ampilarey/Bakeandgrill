<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Gst\Services\GstSettingsService;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateGstSettingsRequest;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GstSettingsController extends Controller
{
    public function __construct(
        private readonly GstSettingsService $settings,
        private readonly AuditLogService $audit,
    ) {}

    public function show(): JsonResponse
    {
        return response()->json(['settings' => $this->settings->adminPayload()]);
    }

    public function update(UpdateGstSettingsRequest $request): JsonResponse
    {
        $old = $this->settings->adminPayload();
        $updated = $this->settings->update($request->validated());

        $this->audit->log(
            'gst.settings.updated',
            'GstSetting',
            $updated->id,
            $old,
            $this->settings->adminPayload(),
            [],
            $request,
        );

        return response()->json([
            'message' => 'GST settings saved.',
            'settings' => $this->settings->adminPayload(),
        ]);
    }
}
