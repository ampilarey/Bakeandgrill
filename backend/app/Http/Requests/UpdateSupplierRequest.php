<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSupplierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:255',
            'contact_name' => 'nullable|string|max:255',
            'phone' => 'nullable|string|max:50',
            'email' => 'nullable|email|max:255',
            'address' => 'nullable|string',
            'payment_terms' => 'nullable|string|max:255',
            'bank_name' => 'nullable|string|max:100',
            'bank_account_name' => 'nullable|string|max:255',
            // Digits, spaces and dashes: an account is copied off a card or a
            // message and a stray space must not lose the payment details.
            'bank_account_number' => ['nullable', 'string', 'max:64', 'regex:/^[0-9 \\-]+$/'],
            'lead_days' => 'nullable|integer|min:0|max:365',
            'notes' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ];
    }
}
