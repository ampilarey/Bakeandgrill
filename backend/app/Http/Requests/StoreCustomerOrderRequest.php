<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

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
            // Doubles as the ARRIVAL time for prepaid dine-in.
            'pickup_slot_at' => 'nullable|date|after:now|required_if:type,dine_in',
            'party_size' => 'nullable|integer|min:1|max:20|required_if:type,dine_in',
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
