<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Inventory\Services\BackdatePolicy;
use Illuminate\Foundation\Http\FormRequest;

class ImportPurchaseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function messages(): array
    {
        return BackdatePolicy::messages('purchase_date');
    }

    public function rules(): array
    {
        return [
            'file' => 'required|file|max:2048|mimes:csv,txt',
            'purchase_date' => BackdatePolicy::rules(required: false),
            'supplier_id' => 'nullable|integer|exists:suppliers,id',
            'notes' => 'nullable|string',
        ];
    }
}
