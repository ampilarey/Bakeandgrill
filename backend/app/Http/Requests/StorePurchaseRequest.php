<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePurchaseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'supplier_id' => 'nullable|integer|exists:suppliers,id',
            'status' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
            'purchase_date' => 'required|date',
            'items' => 'required|array|min:1',
            'items.*.inventory_item_id' => 'nullable|integer|exists:inventory_items,id',
            'items.*.name' => 'required|string|max:255',
            'items.*.quantity' => 'required|numeric|min:0.001',
            'items.*.unit_cost' => 'required|numeric|min:0',
        ];
    }
}
