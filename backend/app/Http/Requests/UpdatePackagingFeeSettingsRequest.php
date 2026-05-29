<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Orders\Services\PackagingFeeCalculator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdatePackagingFeeSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'packaging_enabled' => 'sometimes|boolean',
            'packaging_label' => 'nullable|string|max:50',
            'packaging_type' => 'sometimes|string|in:percent,fixed',
            'packaging_value' => 'sometimes|numeric|min:0',
            'packaging_apply_delivery' => 'sometimes|boolean',
            'packaging_apply_online_pickup' => 'sometimes|boolean',
            'small_order_enabled' => 'sometimes|boolean',
            'small_order_threshold_mvr' => 'sometimes|numeric|min:0',
            'small_order_amount_mvr' => 'sometimes|numeric|min:0',
            'ordering_max_per_15min' => 'sometimes|integer|min:0',
            'ramadan_hours_preset' => 'nullable|array',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
            $data = $v->getData();
            $enabled = (bool) ($data['packaging_enabled'] ?? false);
            $type = (string) ($data['packaging_type'] ?? 'fixed');
            $value = (float) ($data['packaging_value'] ?? 0);

            if ($enabled && trim((string) ($data['packaging_label'] ?? '')) === '') {
                $v->errors()->add('packaging_label', 'Label is required when packaging fee is enabled.');
            }

            if ($type === 'percent' && $value > PackagingFeeCalculator::MAX_PERCENT) {
                $v->errors()->add('packaging_value', 'Percentage cannot exceed ' . PackagingFeeCalculator::MAX_PERCENT . '%.');
            }

            if ($type === 'fixed' && $value > PackagingFeeCalculator::MAX_FIXED_MVR) {
                $v->errors()->add('packaging_value', 'Fixed amount cannot exceed MVR ' . PackagingFeeCalculator::MAX_FIXED_MVR . '.');
            }

            if ($enabled) {
                $any = ($data['packaging_apply_delivery'] ?? false)
                    || ($data['packaging_apply_online_pickup'] ?? false);
                if (!$any) {
                    $v->errors()->add('packaging_apply_delivery', 'Select at least one order type when packaging fee is enabled.');
                }
            }
        });
    }
}
