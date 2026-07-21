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
            // FIX 1: When true, treat external/card tender share as if it were
            // being handed back in cash from the drawer (cashier absorbs the
            // gateway reversal). Default false leaves external tenders out of
            // the till so shift reconciliation stays clean.
            'cash_refund_override' => 'sometimes|boolean',
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
