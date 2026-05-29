<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\Services\PackagingFeeCalculator;
use App\Http\Controllers\Controller;
use App\Http\Requests\UpdatePackagingFeeSettingsRequest;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;

class PackagingFeeSettingsController extends Controller
{
    public function __construct(
        private readonly PackagingFeeCalculator $calculator,
    ) {}

    public function show(): JsonResponse
    {
        return response()->json([
            'settings' => $this->calculator->currentSettings(),
        ]);
    }

    public function update(UpdatePackagingFeeSettingsRequest $request): JsonResponse
    {
        $data = $request->validated();

        if (array_key_exists('packaging_enabled', $data)) {
            SiteSetting::set('packaging_fee_enabled', $data['packaging_enabled'] ? '1' : '0');
        }
        if (array_key_exists('packaging_label', $data)) {
            SiteSetting::set('packaging_fee_label', trim((string) ($data['packaging_label'] ?? 'Packaging fee')));
        }
        if (array_key_exists('packaging_type', $data)) {
            SiteSetting::set('packaging_fee_type', $data['packaging_type']);
        }
        if (array_key_exists('packaging_value', $data)) {
            SiteSetting::set('packaging_fee_value', (string) $data['packaging_value']);
        }
        if (array_key_exists('packaging_apply_delivery', $data)) {
            SiteSetting::set('packaging_fee_apply_delivery', $data['packaging_apply_delivery'] ? '1' : '0');
        }
        if (array_key_exists('packaging_apply_online_pickup', $data)) {
            SiteSetting::set('packaging_fee_apply_online_pickup', $data['packaging_apply_online_pickup'] ? '1' : '0');
        }
        if (array_key_exists('small_order_enabled', $data)) {
            SiteSetting::set('small_order_fee_enabled', $data['small_order_enabled'] ? '1' : '0');
        }
        if (array_key_exists('small_order_threshold_mvr', $data)) {
            SiteSetting::set('small_order_fee_threshold_mvr', (string) $data['small_order_threshold_mvr']);
        }
        if (array_key_exists('small_order_amount_mvr', $data)) {
            SiteSetting::set('small_order_fee_amount_mvr', (string) $data['small_order_amount_mvr']);
        }
        if (array_key_exists('ordering_max_per_15min', $data)) {
            SiteSetting::set('ordering_max_per_15min', (string) $data['ordering_max_per_15min']);
        }
        if (array_key_exists('ramadan_hours_preset', $data)) {
            $preset = $data['ramadan_hours_preset'];
            SiteSetting::set('ramadan_hours_preset', $preset === null ? '' : json_encode($preset));
        }

        SiteSetting::bust();

        return response()->json([
            'message' => 'Packaging fee settings saved.',
            'settings' => $this->calculator->currentSettings(),
        ]);
    }
}
