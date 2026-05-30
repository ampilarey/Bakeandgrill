<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Gst\Services\GstSettingsService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class GstBootstrapController extends Controller
{
    public function __construct(
        private readonly GstSettingsService $settings,
    ) {}

    public function show(): JsonResponse
    {
        return response()->json($this->settings->bootstrapPayload());
    }
}
