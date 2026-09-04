<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCustomerOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // dine_in = prepaid dine-in: customer pays now, arrives at pickup_slot_at.
            'type' => 'sometimes|string|in:online_pickup,dine_in',
            /*
             * The token from the QR on the table, when the customer scanned one.
             *
             * Its presence changes what dine-in means. The existing dine_in is a
             * PRE-order: pay now, arrive at `pickup_slot_at`, party of N. Someone
             * who has just scanned the card on table 4 is already sitting at
             * table 4, so an arrival time and a party size are questions with no
             * answer — see the two `required_if` rules below, which stand down
             * when a table token is present.
             */
            'table_token' => 'nullable|string|size:24|alpha_num',
            'print' => 'sometimes|boolean',
            'notes' => 'nullable|string|max:500',
            'customer_notes' => 'nullable|string|max:500',
            'items' => 'required|array|min:1|max:50',
            // SECURITY: Only accept item_id - server determines price and name
            'items.*.item_id' => 'required|integer|exists:items,id',
            'items.*.quantity' => 'required|integer|min:1|max:99',
            'items.*.variant_id' => 'nullable|integer|exists:variants,id',
            'items.*.modifiers' => 'nullable|array|max:20',
            // SECURITY: Only accept modifier_id - server determines price
            'items.*.modifiers.*.modifier_id' => 'required|integer|exists:modifiers,id',
            'items.*.modifiers.*.quantity' => 'sometimes|integer|min:1|max:10',
            'items.*.packaging_option_id' => 'nullable|integer|exists:item_packaging_options,id',
            // Platter picks — each becomes a child order_items row (not notes/JSON).
            'items.*.children' => 'nullable|array|max:50',
            'items.*.children.*.item_id' => 'required_with:items.*.children|integer|exists:items,id',
            'items.*.children.*.quantity' => 'required_with:items.*.children|integer|min:1|max:99',
            'items.*.children.*.group_id' => 'nullable|integer|exists:platter_groups,id',
            'items.*.children.*.surcharge' => 'nullable|numeric|min:0',
            // Doubles as the ARRIVAL time for prepaid dine-in.
            'pickup_slot_at' => [
                'nullable', 'date', 'after:now',
                Rule::requiredIf(fn () => $this->input('type') === 'dine_in' && !$this->filled('table_token')),
            ],
            'party_size' => [
                'nullable', 'integer', 'min:1', 'max:20',
                Rule::requiredIf(fn () => $this->input('type') === 'dine_in' && !$this->filled('table_token')),
            ],
            // Collection intent — server recomputes the allowed tomorrow date.
            // Clients may send fulfil_date (Y-m-d) and/or collect_on ("today"|"tomorrow").
            'fulfil_date' => 'nullable|date_format:Y-m-d',
            'collect_on' => 'nullable|string|in:today,tomorrow',
            // Free-reward claims from the cart picker — server re-checks entitlement.
            'reward_claims' => 'nullable|array|max:10',
            'reward_claims.*.promotion_id' => 'required_with:reward_claims|integer|min:1',
            'reward_claims.*.item_id' => 'required_with:reward_claims|integer|min:1',
        ];
    }

    public function messages(): array
    {
        return [
            'pickup_slot_at.required_if' => 'Choose an arrival time for your dine-in order.',
            'party_size.required_if' => 'Tell us how many people are coming.',
        ];
    }
}
