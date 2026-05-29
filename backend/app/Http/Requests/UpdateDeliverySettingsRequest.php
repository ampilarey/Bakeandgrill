<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateDeliverySettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'default_fee' => ['required', 'numeric', 'min:0', 'max:9999'],
            'free_threshold' => ['required', 'numeric', 'min:0', 'max:99999'],
            'zone_fees' => ['required', 'array'],
            'zone_fees.*' => ['numeric', 'min:0', 'max:9999'],
            'restrict_to_zone_fees' => ['sometimes', 'boolean'],
            'zone_whitelist' => ['nullable', 'array'],
            'zone_whitelist.*' => ['string', 'max:100'],
        ];
    }
}
