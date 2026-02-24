<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => 'required|string|in:dine_in,takeaway,online_pickup',
            'print' => 'sometimes|boolean',
            'device_identifier' => 'nullable|string|max:255',
            'restaurant_table_id' => 'nullable|integer|exists:restaurant_tables,id',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'notes' => 'nullable|string',
            'customer_notes' => 'nullable|string',
            'discount_amount' => 'nullable|numeric|min:0',
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'nullable|integer|exists:items,id',
            'items.*.name' => 'required|string|max:255',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.modifiers' => 'nullable|array',
            'items.*.modifiers.*.modifier_id' => 'nullable|integer|exists:modifiers,id',
            'items.*.modifiers.*.name' => 'required|string|max:255',
            'items.*.modifiers.*.price' => 'required|numeric|min:0',
        ];
    }
}
