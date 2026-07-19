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
            'packaging_label' => 'nullable|string|max:50',
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
            $threshold = (float) ($data['small_order_threshold_mvr'] ?? 0);
            $amount = (float) ($data['small_order_amount_mvr'] ?? 0);

            if ($threshold > PackagingFeeCalculator::MAX_FIXED_MVR) {
                $v->errors()->add('small_order_threshold_mvr', 'Threshold cannot exceed MVR ' . PackagingFeeCalculator::MAX_FIXED_MVR . '.');
            }

            if ($amount > PackagingFeeCalculator::MAX_FIXED_MVR) {
                $v->errors()->add('small_order_amount_mvr', 'Fee cannot exceed MVR ' . PackagingFeeCalculator::MAX_FIXED_MVR . '.');
            }
        });
    }
}
