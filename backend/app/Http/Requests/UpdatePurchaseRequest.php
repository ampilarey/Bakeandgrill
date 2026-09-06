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
            /*
             * The lines. Omit the key and they are left alone — which is what
             * every existing caller does, so header-only edits are unchanged.
             * Send it and it replaces them wholesale: an order is a small,
             * whole document, and diffing rows to spare a few writes would
             * add a merge to get wrong for no gain anybody would notice.
             *
             * Same shape as StorePurchaseRequest on purpose. Editing an order
             * and raising one are the same act with a different starting
             * point, and two shapes would drift.
             */
            'items' => 'sometimes|array|min:1',
            'items.*.inventory_item_id' => 'required_with:items|integer|exists:inventory_items,id',
            'items.*.quantity' => 'required_with:items|numeric|min:0.000001',
            'items.*.unit_cost' => 'required_with:items|numeric|min:0',
            'items.*.purchase_unit_id' => 'nullable|integer|exists:inventory_purchase_units,id',
            'items.*.brand' => 'nullable|string|max:120',
        ];
    }
}
