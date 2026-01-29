<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ImportPurchaseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'file' => 'required|file|max:2048|mimes:csv,txt',
            'purchase_date' => 'nullable|date',
            'supplier_id' => 'nullable|integer|exists:suppliers,id',
            'notes' => 'nullable|string',
        ];
    }
}
