<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Inventory\Services\BackdatePolicy;
use Illuminate\Foundation\Http\FormRequest;

class StorePurchaseRequest extends FormRequest
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
            // Optional for POS walk-in receive; admin POs usually set a supplier.
            'supplier_id' => 'nullable|integer|exists:suppliers,id',
            // Where it was bought, when that is not a supplier on file — the
            // corner shop, the cash-and-carry. Either identifies the seller.
            'supplier_name_text' => 'nullable|string|max:255',
            'status' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
            // Backdating is allowed within a window; forward-dating never is.
            'purchase_date' => BackdatePolicy::rules(),
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
            // With a pack, the quantity counts packs and the cost is per pack.
            // Without one, both are in the item's own unit, as they always were.
            'items.*.quantity' => 'required|numeric|min:0.000001',
            'items.*.unit_cost' => 'required|numeric|min:0',
            // Checked against the line's own item in PurchasePackResolver: one
            // item's pack applied to another would multiply the wrong stock.
            'items.*.purchase_unit_id' => 'nullable|integer|exists:inventory_purchase_units,id',
            // Free text: brands come and go, and a register of them would be
            // one more list to maintain for no gain.
            'items.*.brand' => 'nullable|string|max:120',
        ];
    }
}
