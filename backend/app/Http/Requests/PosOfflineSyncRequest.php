<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PosOfflineSyncRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->tokenCan('staff') ?? false;
    }

    public function rules(): array
    {
        return [
            'orders' => ['required', 'array', 'min:1', 'max:20'],
            'orders.*.idempotency_key' => ['required', 'string', 'max:64'],
            'orders.*.local_order_id' => ['required', 'string', 'max:64'],
            'orders.*.local_order_number' => ['nullable', 'string', 'max:64'],
            'orders.*.device_identifier' => ['nullable', 'string', 'max:64'],
            'orders.*.shift_id' => ['required', 'integer', 'exists:shifts,id'],
            'orders.*.created_at_local' => ['required', 'date'],
            'orders.*.type' => ['required', 'string', Rule::in(['dine_in', 'takeaway', 'online_pickup', 'delivery'])],
            'orders.*.items' => ['required', 'array', 'min:1'],
            'orders.*.items.*.item_id' => ['required', 'integer', 'exists:items,id'],
            // Bounds match StoreOrderRequest. An order must not be creatable
            // two ways under two different rule sets: OrderCreationService
            // multiplies modifier_price by modifier quantity with no clamp of
            // its own, so an unbounded value here becomes a distorted total
            // that flows on into GST and shift cash reconciliation.
            'orders.*.items.*.quantity' => ['required', 'integer', 'min:1', 'max:999'],
            'orders.*.items.*.variant_id' => ['nullable', 'integer'],
            'orders.*.items.*.packaging_option_id' => ['nullable', 'integer', 'exists:item_packaging_options,id'],
            'orders.*.items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'orders.*.items.*.modifiers' => ['nullable', 'array'],
            'orders.*.items.*.modifiers.*.modifier_id' => ['required', 'integer', 'exists:modifiers,id'],
            'orders.*.items.*.modifiers.*.quantity' => ['nullable', 'integer', 'min:1', 'max:10'],
            'orders.*.items.*.children' => ['nullable', 'array'],
            'orders.*.items.*.children.*.item_id' => ['required_with:orders.*.items.*.children', 'integer', 'exists:items,id'],
            'orders.*.items.*.children.*.quantity' => ['required_with:orders.*.items.*.children', 'integer', 'min:1', 'max:99'],
            'orders.*.items.*.notes' => ['nullable', 'string', 'max:255'],
            'orders.*.totals' => ['required', 'array'],
            'orders.*.totals.subtotal' => ['required', 'numeric', 'min:0'],
            'orders.*.totals.tax' => ['required', 'numeric', 'min:0'],
            'orders.*.totals.total' => ['required', 'numeric', 'min:0'],
            'orders.*.totals.packaging' => ['nullable', 'numeric', 'min:0'],
            'orders.*.payment' => ['required', 'array'],
            'orders.*.payment.method' => ['required', 'string', Rule::in(['cash', 'card', 'qr', 'bank_transfer'])],
            'orders.*.payment.amount' => ['required', 'numeric', 'min:0'],
            'orders.*.payment.reference' => ['nullable', 'string', 'max:255'],
            'orders.*.payment.reference_number' => ['nullable', 'string', 'max:255'],
            'orders.*.discount_amount' => ['nullable', 'numeric', 'min:0'],
            'orders.*.customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'orders.*.restaurant_table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'],
            'orders.*.ticket_name' => ['nullable', 'string', 'max:255'],
            'orders.*.ticket_note' => ['nullable', 'string', 'max:500'],
            'orders.*.prepared_locally' => ['nullable', 'boolean'],
            'orders.*.rewards' => ['nullable', 'array'],
            'orders.*.rewards.promo_code' => ['nullable', 'string', 'max:50'],
            'orders.*.rewards.loyalty_points' => ['nullable', 'integer', 'min:0'],
            'orders.*.rewards.gift_card_code' => ['nullable', 'string', 'max:20'],
        ];
    }
}
