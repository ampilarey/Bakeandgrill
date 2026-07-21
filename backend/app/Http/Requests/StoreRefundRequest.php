<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreRefundRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->tokenCan('staff') ?? false;
    }

    public function rules(): array
    {
        return [
            'amount' => 'required|numeric|min:0.01',
            'reason' => 'nullable|string|max:1000',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($this->exists('status') || array_key_exists('status', $this->all())) {
                $validator->errors()->add(
                    'status',
                    'Refund status cannot be set by the client — refunds are always created as approved.',
                );
            }
        });
    }
}
