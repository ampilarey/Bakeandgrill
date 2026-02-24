<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrderBatchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'orders' => 'required|array|min:1',
            'orders.*.type' => 'required|string|in:dine_in,takeaway,online_pickup',
            'orders.*.print' => 'sometimes|boolean',
            'orders.*.device_identifier' => 'nullable|string|max:255',
            'orders.*.restaurant_table_id' => 'nullable|integer|exists:restaurant_tables,id',
            'orders.*.customer_id' => 'nullable|integer|exists:customers,id',
            'orders.*.notes' => 'nullable|string',
            'orders.*.customer_notes' => 'nullable|string',
            'orders.*.discount_amount' => 'nullable|numeric|min:0',
            'orders.*.items' => 'required|array|min:1',
            'orders.*.items.*.item_id' => 'required|integer|exists:items,id',
            'orders.*.items.*.variant_id' => 'nullable|integer|exists:variants,id',
            'orders.*.items.*.quantity' => 'required|integer|min:1',
            'orders.*.items.*.modifiers' => 'nullable|array',
            'orders.*.items.*.modifiers.*.modifier_id' => 'required|integer|exists:modifiers,id',
            'orders.*.items.*.modifiers.*.quantity' => 'nullable|integer|min:1',
        ];
    }
}
