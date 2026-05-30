<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Gst\Enums\GstAccountingBasis;
use App\Domains\Gst\Enums\GstSector;
use App\Domains\Gst\Enums\GstTaxablePeriod;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateGstSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user && (
            $user->role?->slug === 'owner'
            || $user->hasPermission('settings.manage')
            || $user->hasPermission('settings.update')
            || $user->hasPermission('reports.financial')
        );
    }

    public function rules(): array
    {
        return [
            'gst_registered' => ['sometimes', 'boolean'],
            'seller_name' => ['nullable', 'string', 'max:255'],
            'seller_address' => ['nullable', 'string'],
            'seller_tin' => ['nullable', 'string', 'max:30'],
            'taxable_activity_no' => ['nullable', 'string', 'max:30'],
            'sector' => ['sometimes', Rule::in(GstSector::values())],
            'default_tax_rate_bp' => ['sometimes', 'integer', 'min:0', 'max:10000'],
            'tax_inclusive' => ['sometimes', 'boolean'],
            'taxable_period' => ['sometimes', Rule::in(GstTaxablePeriod::values())],
            'accounting_basis' => ['sometimes', Rule::in(GstAccountingBasis::values())],
            'currency' => ['sometimes', 'string', 'size:3'],
            'invoice_prefix' => ['sometimes', 'string', 'max:20'],
            'credit_note_prefix' => ['sometimes', 'string', 'max:20'],
            'invoice_sequence_mode' => ['sometimes', 'in:yearly,daily'],
            'next_invoice_sequence' => ['sometimes', 'integer', 'min:1'],
            'next_credit_note_sequence' => ['sometimes', 'integer', 'min:1'],
            'lock_after_export' => ['sometimes', 'boolean'],
        ];
    }
}
