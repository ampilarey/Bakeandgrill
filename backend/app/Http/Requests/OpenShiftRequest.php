<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Shifts\CashDenominationCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class OpenShiftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Owner, 2026-10-03: the float can be counted note by note, like the
            // close. On that path the server totals the notes; opening_cash is
            // only required for a plain total (and older clients that send no method).
            'opening_count_method' => [
                'nullable',
                Rule::in([
                    CashDenominationCatalog::METHOD_DENOMINATIONS,
                    CashDenominationCatalog::METHOD_PLAIN_TOTAL,
                ]),
            ],
            'opening_cash' => [
                'nullable',
                'numeric',
                'min:0',
                'required_unless:opening_count_method,' . CashDenominationCatalog::METHOD_DENOMINATIONS,
            ],
            // Map of denomination_laari => count, as at close. Empty means an empty drawer.
            'opening_denominations' => ['nullable', 'array'],
            'opening_denominations.*' => 'nullable|integer|min:0|max:99999',
            'device_id' => 'nullable|integer|exists:devices,id',
            'notes' => 'nullable|string',
            // A manager opening over another cashier's shift on the same till.
            'override' => 'nullable|boolean',
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if ($this->input('opening_count_method') !== CashDenominationCatalog::METHOD_DENOMINATIONS) {
                return;
            }
            if (!$this->exists('opening_denominations') || !is_array($this->input('opening_denominations'))) {
                $validator->errors()->add('opening_denominations', 'Denomination counts are required.');

                return;
            }
            foreach (array_keys($this->input('opening_denominations')) as $key) {
                if (!CashDenominationCatalog::isAllowed((int) $key)) {
                    $validator->errors()->add('opening_denominations', 'Unknown denomination: ' . $key);
                }
            }
        });
    }

    /**
     * The counted float and how it was counted.
     *
     * @return array{method: string, breakdown: array<string,int>|null, opening_cash: float}
     */
    public function openingCount(): array
    {
        if ($this->input('opening_count_method') === CashDenominationCatalog::METHOD_DENOMINATIONS) {
            $raw = is_array($this->input('opening_denominations')) ? $this->input('opening_denominations') : [];

            return [
                'method' => CashDenominationCatalog::METHOD_DENOMINATIONS,
                'breakdown' => CashDenominationCatalog::normalizeBreakdown($raw),
                'opening_cash' => round(CashDenominationCatalog::totalLaariFromCounts($raw) / 100, 2),
            ];
        }

        return [
            'method' => CashDenominationCatalog::METHOD_PLAIN_TOTAL,
            'breakdown' => null,
            'opening_cash' => round((float) $this->input('opening_cash'), 2),
        ];
    }
}
