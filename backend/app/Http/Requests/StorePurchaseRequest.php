<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePurchaseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Optional for POS walk-in receive; admin POs usually set a supplier.
            'supplier_id' => 'nullable|integer|exists:suppliers,id',
            'status' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
            'purchase_date' => 'required|date',
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
            'items' => 'required|array|min:1',
            // Required so POS/admin immediate receives actually update stock.
            'items.*.inventory_item_id' => 'required|integer|exists:inventory_items,id',
            'items.*.name' => 'nullable|string|max:255',
            'items.*.quantity' => 'required|numeric|min:0.001',
            'items.*.unit_cost' => 'required|numeric|min:0',
        ];
    }
}
