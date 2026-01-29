<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSmsPromotionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'nullable|string|max:255',
            'message' => 'required|string|max:480',
            'filters' => 'nullable|array',
            'filters.active_only' => 'sometimes|boolean',
            'filters.last_order_days' => 'sometimes|integer|min:0',
            'filters.min_orders' => 'sometimes|integer|min:0',
            'filters.include_opted_out' => 'sometimes|boolean',
        ];
    }
}
