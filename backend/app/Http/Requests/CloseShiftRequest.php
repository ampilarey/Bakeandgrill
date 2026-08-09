<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Shifts\CashDenominationCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CloseShiftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'cash_count_method' => [
                'nullable',
                'string',
                Rule::in([
                    CashDenominationCatalog::METHOD_DENOMINATIONS,
                    CashDenominationCatalog::METHOD_PLAIN_TOTAL,
                ]),
            ],
            // Plain-total path (and legacy clients that omit method).
            'closing_cash' => [
                'nullable',
                'numeric',
                'min:0',
                'required_unless:cash_count_method,'.CashDenominationCatalog::METHOD_DENOMINATIONS,
            ],
            // Map of denomination_laari => count. Empty / omitted boxes are zero.
            // Empty array is valid (drawer counted as MVR 0).
            'denominations' => ['nullable', 'array'],
            'denominations.*' => 'nullable|integer|min:0|max:99999',
            'foreign_currency' => 'nullable|array|max:20',
            'foreign_currency.*.currency' => 'required|string|size:3',
            'foreign_currency.*.denomination' => 'required|numeric|min:0',
            'foreign_currency.*.count' => 'required|integer|min:1|max:9999',
            'foreign_currency.*.accepted_mvr' => 'required|numeric|min:0',
            'notes' => 'nullable|string',
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $method = (string) ($this->input('cash_count_method') ?? CashDenominationCatalog::METHOD_PLAIN_TOTAL);
            if ($method !== CashDenominationCatalog::METHOD_DENOMINATIONS) {
                return;
            }

            // Field must be present (may be []) so the client is intentionally
            // on the denomination path — not silently treated as plain total.
            if (! $this->exists('denominations') || ! is_array($this->input('denominations'))) {
                $validator->errors()->add('denominations', 'Denomination counts are required.');

                return;
            }

            foreach (array_keys($this->input('denominations')) as $key) {
                if (! CashDenominationCatalog::isAllowed((int) $key)) {
                    $validator->errors()->add('denominations', 'Unknown denomination: '.$key);
                }
            }
        });
    }
}
