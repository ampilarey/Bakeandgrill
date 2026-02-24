<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $itemId = $this->route('id');

        return [
            'category_id' => 'nullable|exists:categories,id',
            'name' => 'sometimes|string|max:255',
            'name_dv' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'sku' => 'nullable|string|max:100|unique:items,sku,' . $itemId,
            'barcode' => 'nullable|string|max:100|unique:items,barcode,' . $itemId,
            'image_url' => 'nullable|url',
            'base_price' => 'sometimes|numeric|min:0',
            'cost' => 'nullable|numeric|min:0',
            'tax_rate' => 'nullable|numeric|min:0|max:100',
            'is_active' => 'sometimes|boolean',
            'is_available' => 'sometimes|boolean',
            'sort_order' => 'nullable|integer',
            'modifier_ids' => 'sometimes|array',
            'modifier_ids.*' => 'integer|exists:modifiers,id',
        ];
    }
}
