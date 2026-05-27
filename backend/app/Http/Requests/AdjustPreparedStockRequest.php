<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AdjustPreparedStockRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'delta' => 'required|integer|not_in:0',
            'variant_id' => 'nullable|integer|exists:variants,id',
            'notes' => 'nullable|string|max:255',
        ];
    }
}
