<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OpenTableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'print' => 'sometimes|boolean',
            'device_identifier' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'items' => 'sometimes|array|min:1',
            'items.*.item_id' => 'nullable|integer|exists:items,id',
            'items.*.name' => 'required_with:items|string|max:255',
            'items.*.quantity' => 'required_with:items|integer|min:1',
            'items.*.modifiers' => 'nullable|array',
            'items.*.modifiers.*.modifier_id' => 'nullable|integer|exists:modifiers,id',
            'items.*.modifiers.*.name' => 'required_with:items.*.modifiers|string|max:255',
            'items.*.modifiers.*.price' => 'required_with:items.*.modifiers|numeric|min:0',
        ];
    }
}
