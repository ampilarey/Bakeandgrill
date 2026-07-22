<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePurchaseRequestItemQuoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'supplier_name_text' => ['nullable', 'string', 'max:255'],
            'unit_price_laar' => ['required', 'integer', 'min:0'],
            'unit' => ['nullable', 'string', 'max:32'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
