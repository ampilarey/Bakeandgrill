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

    protected function prepareForValidation(): void
    {
        if ($this->image_url === '') {
            $this->merge(['image_url' => null]);
        }

        // MySQL NOT NULL DEFAULT 0 columns: replace null with 0 so the update succeeds
        $defaults = ['sort_order' => 0, 'cost' => 0, 'tax_rate' => 0];
        foreach ($defaults as $field => $default) {
            if ($this->has($field) && $this->input($field) === null) {
                $this->merge([$field => $default]);
            }
        }
    }

    public function rules(): array
    {
        $itemId = $this->route('id');

        return [
            'category_id' => 'nullable|exists:categories,id',
            'name' => 'sometimes|string|max:255',
            'name_dv' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'sku' => 'nullable|string|max:100|unique:items,sku,'.$itemId,
            'barcode' => 'nullable|string|max:100|unique:items,barcode,'.$itemId,
            'image_url' => 'nullable|url',
            'base_price' => 'sometimes|numeric|min:0',
            'has_variants' => 'sometimes|boolean',
            'cost' => 'nullable|numeric|min:0',
            'tax_rate' => 'nullable|numeric|min:0|max:100',
            'is_active' => 'sometimes|boolean',
            'is_available' => 'sometimes|boolean',
            'sort_order' => 'nullable|integer',
            'modifier_ids' => 'sometimes|array',
            'modifier_ids.*' => 'integer|exists:modifiers,id',
            'menu_group_id' => 'nullable|integer|exists:menu_groups,id',
            // Channel availability
            'channel_availability' => 'sometimes|array',
            'channel_availability.*.channel' => 'required_with:channel_availability|string|in:dine_in,takeaway,online_pickup,delivery',
            'channel_availability.*.is_enabled' => 'sometimes|boolean',
            'channel_availability.*.valid_from' => 'nullable|date',
            'channel_availability.*.valid_until' => 'nullable|date',
            // Variants
            'variants' => 'sometimes|array',
            'variants.*.id' => 'sometimes|nullable|integer|exists:variants,id',
            'variants.*.name' => 'required_with:variants|string|max:100',
            'variants.*.name_dv' => 'nullable|string|max:100',
            'variants.*.price' => 'required_with:variants|numeric|min:0',
            'variants.*.cost' => 'nullable|numeric|min:0',
            'variants.*.sku' => 'nullable|string|max:100',
            'variants.*.track_stock' => 'nullable|boolean',
            'variants.*.stock_qty' => 'nullable|integer|min:0',
            'variants.*.is_active' => 'nullable|boolean',
            'variants.*.sort_order' => 'nullable|integer',
        ];
    }
}
