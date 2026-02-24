<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StockCountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'counts' => 'required|array|min:1',
            'counts.*.inventory_item_id' => 'required|integer|exists:inventory_items,id',
            'counts.*.quantity' => 'required|numeric|min:0',
            'counts.*.notes' => 'nullable|string|max:1000',
        ];
    }
}
