<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCashMovementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => 'required|string|in:cash_in,cash_out',
            'amount' => 'required|numeric|min:0.01',
            'reason' => 'required|string|max:255',
        ];
    }
}
