<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OpenShiftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'opening_cash' => 'required|numeric|min:0',
            'device_id' => 'nullable|integer|exists:devices,id',
            'notes' => 'nullable|string',
        ];
    }
}
