<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Delivery\Services\DeliverySettingsService;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateDeliverySettingsRequest;
use App\Services\DeliveryGateService;
use Illuminate\Http\JsonResponse;

class DeliverySettingsController extends Controller
{
    public function __construct(
        private readonly DeliverySettingsService $settings,
        private readonly DeliveryGateService $deliveryGate,
    ) {}

    public function show(): JsonResponse
    {
        return response()->json([
            'settings' => $this->settings->resolve(),
            'delivery_status' => $this->deliveryGate->status(),
        ]);
    }

    public function update(UpdateDeliverySettingsRequest $request): JsonResponse
    {
        $saved = $this->settings->update($request->validated());

        return response()->json([
            'message' => 'Delivery fee settings saved.',
            'settings' => $saved,
            'delivery_status' => $this->deliveryGate->status(),
        ]);
    }
}
