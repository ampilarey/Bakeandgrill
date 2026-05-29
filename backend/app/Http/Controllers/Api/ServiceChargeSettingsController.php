<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\Services\ServiceChargeCalculator;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateServiceChargeSettingsRequest;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;

class ServiceChargeSettingsController extends Controller
{
    public function __construct(
        private readonly ServiceChargeCalculator $calculator,
    ) {}

    public function show(): JsonResponse
    {
        return response()->json([
            'settings' => $this->calculator->currentSettings(),
        ]);
    }

    public function update(UpdateServiceChargeSettingsRequest $request): JsonResponse
    {
        $data = $request->validated();

        SiteSetting::set('service_charge_enabled', $data['enabled'] ? '1' : '0');
        SiteSetting::set('service_charge_label', trim((string) ($data['label'] ?? 'Service charge')));
        SiteSetting::set('service_charge_type', $data['type']);
        SiteSetting::set('service_charge_value', (string) $data['value']);
        SiteSetting::set('service_charge_apply_dine_in', $data['apply_dine_in'] ? '1' : '0');
        SiteSetting::set('service_charge_apply_takeaway', $data['apply_takeaway'] ? '1' : '0');
        SiteSetting::set('service_charge_apply_online_pickup', $data['apply_online_pickup'] ? '1' : '0');
        SiteSetting::set('service_charge_apply_delivery', $data['apply_delivery'] ? '1' : '0');
        SiteSetting::set('service_charge_taxable', $data['taxable'] ? '1' : '0');
        SiteSetting::set('show_service_charge_on_receipts', $data['show_on_receipts'] ? '1' : '0');

        SiteSetting::bust();

        return response()->json([
            'message' => 'Service charge settings saved.',
            'settings' => $this->calculator->currentSettings(),
        ]);
    }
}
