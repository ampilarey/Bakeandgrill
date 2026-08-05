<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Rules\MediaUrl;
use Illuminate\Foundation\Http\FormRequest;

class StoreItemRequest extends FormRequest
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
        if ($this->image_original_url === '') {
            $this->merge(['image_original_url' => null]);
        }
        if ($this->thumb_url === '') {
            $this->merge(['thumb_url' => null]);
        }

        // MySQL NOT NULL DEFAULT 0 columns: replace null with 0 so the insert succeeds
        $defaults = ['sort_order' => 0, 'cost' => 0, 'tax_rate' => 0];
        foreach ($defaults as $field => $default) {
            if ($this->has($field) && $this->input($field) === null) {
                $this->merge([$field => $default]);
            }
        }
    }

    public function rules(): array
    {
        return [
            'category_id' => 'nullable|exists:categories,id',
            'name' => 'required|string|max:255',
            'name_dv' => 'nullable|string|max:255',
            'card_name' => 'nullable|string|max:120',
            'card_name_dv' => 'nullable|string|max:120',
            'description' => 'nullable|string',
            'short_description' => 'nullable|string|max:140',
            'short_description_dv' => 'nullable|string|max:140',
            'sku' => 'nullable|string|max:100|unique:items,sku',
            'barcode' => 'nullable|string|max:100|unique:items,barcode',
            'image_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'image_original_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'thumb_url' => ['nullable', 'string', 'max:2048', new MediaUrl],
            'base_price' => 'required|numeric|min:0',
            'price_note' => 'nullable|string|max:40',
            'packaging_fee' => 'sometimes|numeric|min:0|max:500',
            'packaging_fee_mode' => 'sometimes|string|in:per_unit,per_line',
            'packaging_options' => 'sometimes|array|max:10',
            'packaging_options.*.id' => 'sometimes|nullable|integer|exists:item_packaging_options,id',
            'packaging_options.*.name' => 'required_with:packaging_options|string|max:80',
            'packaging_options.*.name_dv' => 'nullable|string|max:80',
            'packaging_options.*.fee' => 'required_with:packaging_options|numeric|min:0|max:500',
            'packaging_options.*.is_default' => 'sometimes|boolean',
            'packaging_options.*.is_active' => 'sometimes|boolean',
            'packaging_options.*.sort_order' => 'sometimes|integer|min:0',
            'has_variants' => 'sometimes|boolean',
            'cost' => 'nullable|numeric|min:0',
            'tax_rate' => 'nullable|numeric|min:0|max:100',
            'tax_code' => 'sometimes|string|in:standard_8,zero_rated,exempt,out_of_scope',
            'is_active' => 'sometimes|boolean',
            'is_available' => 'sometimes|boolean',
            'track_stock' => 'sometimes|boolean',
            'stock_quantity' => 'nullable|integer|min:0',
            'low_stock_threshold' => 'nullable|integer|min:0',
            'availability_type' => 'sometimes|string|in:always,stock_based,made_to_order,pre_order_only',
            // Order-for-tomorrow: revive existing items.allow_pre_order column.
            'allow_pre_order' => 'sometimes|boolean',
            // Per-day max for collect-tomorrow. Null/omitted = unlimited.
            'tomorrow_daily_capacity' => 'sometimes|nullable|integer|min:1',
            'sort_order' => 'nullable|integer',
            'modifier_ids' => 'sometimes|array',
            'modifier_ids.*' => 'integer|exists:modifiers,id',
            'menu_group_id' => 'nullable|integer|exists:menu_groups,id',
            // Channel availability — same shape as update(), optional. When
            // omitted, ItemController::store seeds every channel as
            // enabled so the new item is sellable everywhere by default.
            'channel_availability' => 'sometimes|array',
            'channel_availability.*.channel' => ['required_with:channel_availability', 'in:dine_in,takeaway,online_pickup,delivery,catering'],
            'channel_availability.*.is_enabled' => 'sometimes|boolean',
            'channel_availability.*.valid_from' => 'sometimes|nullable|date',
            'channel_availability.*.valid_until' => 'sometimes|nullable|date',
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
            'variants.*.low_stock_threshold' => 'nullable|integer|min:0',
            'variants.*.is_active' => 'nullable|boolean',
            'variants.*.sort_order' => 'nullable|integer',
            'is_combo' => 'sometimes|boolean',
            'show_on_signage' => 'sometimes|boolean',
            'is_signage_promoted' => 'sometimes|boolean',
            'combo_discount_pct' => 'nullable|numeric|min:0|max:100',
            'combo_items' => 'sometimes|array',
            'combo_items.*.item_id' => 'required_with:combo_items|integer|exists:items,id',
            'combo_items.*.quantity' => 'nullable|integer|min:1|max:99',
            'dietary_tags' => 'sometimes|nullable|array|max:12',
            'dietary_tags.*' => 'string|max:40',
            'allergens' => 'sometimes|nullable|array|max:12',
            'allergens.*' => 'string|max:40',
            'prep_time_minutes' => 'sometimes|nullable|integer|min:0|max:480',
            'calories' => 'sometimes|nullable|integer|min:0|max:9999',
            'spice_level' => 'sometimes|nullable|string|in:none,mild,medium,hot,extra_hot',
            'combo_items.*.is_optional' => 'nullable|boolean',
        ];
    }
}
