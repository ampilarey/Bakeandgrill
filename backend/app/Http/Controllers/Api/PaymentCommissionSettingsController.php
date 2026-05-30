<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Payments\Services\PaymentCommissionService;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdatePaymentCommissionSettingsRequest;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;

class PaymentCommissionSettingsController extends Controller
{
    public function __construct(
        private readonly PaymentCommissionService $commission,
    ) {}

    public function show(): JsonResponse
    {
        return response()->json([
            'settings' => $this->commission->currentSettings(),
        ]);
    }

    public function update(UpdatePaymentCommissionSettingsRequest $request): JsonResponse
    {
        $data = $request->validated();

        SiteSetting::set('payment_commission_enabled', $data['enabled'] ? '1' : '0');
        SiteSetting::set('payment_commission_pos_card_rate_bp', (string) $data['pos_card_rate_bp']);
        SiteSetting::set('payment_commission_online_gateway_rate_bp', (string) $data['online_gateway_rate_bp']);
        SiteSetting::bust();

        return response()->json([
            'message' => 'Payment commission settings saved.',
            'settings' => $this->commission->currentSettings(),
        ]);
    }
}
