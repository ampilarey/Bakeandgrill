<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrderPaymentsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'payments' => 'required|array|min:1',
            'print_receipt' => 'sometimes|boolean',
            'payments.*.method' => 'required|string|max:50',
            'payments.*.amount' => 'required|numeric|min:0.01',
            'payments.*.status' => 'nullable|string|max:50',
            'payments.*.reference_number' => 'nullable|string|max:255',
        ];
    }
}
