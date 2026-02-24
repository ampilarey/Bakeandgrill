<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AdjustInventoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'quantity' => 'required|numeric',
            'type' => 'required|string|in:adjustment,waste,correction',
            'unit_cost' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
        ];
    }
}
