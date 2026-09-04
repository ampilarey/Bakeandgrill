<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Inventory\Services\BackdatePolicy;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePurchaseRequest extends FormRequest
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
            'status' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
            'purchase_date' => BackdatePolicy::rules(required: false),
            'supplier_tin' => 'nullable|string|max:30',
            'supplier_invoice_no' => 'nullable|string|max:64',
            'supplier_invoice_date' => 'nullable|date',
            'amount_excluding_gst_laar' => 'nullable|integer|min:0',
            'gst_rate_bp' => 'nullable|integer|min:0|max:10000',
            'gst_laar' => 'nullable|integer|min:0',
            'total_laar' => 'nullable|integer|min:0',
            'is_tax_invoice_received' => 'nullable|boolean',
            'is_input_tax_claimable' => 'nullable|boolean',
            'claim_block_reason' => 'nullable|string|max:500',
            'revenue_or_capital' => 'nullable|in:revenue,capital',
            'taxable_activity_no' => 'nullable|string|max:30',
        ];
    }
}
