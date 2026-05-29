<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Orders\Services\ServiceChargeCalculator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateServiceChargeSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'enabled' => 'required|boolean',
            'label' => 'nullable|string|max:50',
            'type' => 'required|string|in:percent,fixed',
            'value' => 'required|numeric|min:0',
            'apply_dine_in' => 'required|boolean',
            'apply_takeaway' => 'required|boolean',
            'apply_online_pickup' => 'required|boolean',
            'apply_delivery' => 'required|boolean',
            'taxable' => 'required|boolean',
            'show_on_receipts' => 'required|boolean',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $data = $v->getData();
            $enabled = (bool) ($data['enabled'] ?? false);
            $type = (string) ($data['type'] ?? 'percent');
            $value = (float) ($data['value'] ?? 0);

            if ($enabled && trim((string) ($data['label'] ?? '')) === '') {
                $v->errors()->add('label', 'Label is required when service charge is enabled.');
            }

            if ($type === 'percent' && $value > ServiceChargeCalculator::MAX_PERCENT) {
                $v->errors()->add('value', 'Percentage cannot exceed ' . ServiceChargeCalculator::MAX_PERCENT . '%.');
            }

            if ($type === 'fixed' && $value > ServiceChargeCalculator::MAX_FIXED_MVR) {
                $v->errors()->add('value', 'Fixed amount cannot exceed MVR ' . ServiceChargeCalculator::MAX_FIXED_MVR . '.');
            }

            if ($enabled) {
                $any = ($data['apply_dine_in'] ?? false)
                    || ($data['apply_takeaway'] ?? false)
                    || ($data['apply_online_pickup'] ?? false)
                    || ($data['apply_delivery'] ?? false);
                if (!$any) {
                    $v->errors()->add('apply_dine_in', 'Select at least one order type when service charge is enabled.');
                }
            }
        });
    }
}
