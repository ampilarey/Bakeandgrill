<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Rules\MaldivesPhone;
use Illuminate\Foundation\Http\FormRequest;

class StoreGuestOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'guest_phone'   => ['required', 'string', new MaldivesPhone()],
            'guest_name'    => 'required|string|max:100',
            'guest_email'   => 'nullable|email|max:150',
            'type'          => 'sometimes|string|in:online_pickup',
            'notes'         => 'nullable|string|max:500',
            'customer_notes' => 'nullable|string|max:500',
            'items'         => 'required|array|min:1|max:50',
            // SECURITY: Only accept item_id — server determines price and name
            'items.*.item_id'                   => 'required|integer|exists:items,id',
            'items.*.quantity'                  => 'required|integer|min:1|max:99',
            'items.*.variant_id'                => 'nullable|integer|exists:variants,id',
            'items.*.modifiers'                 => 'nullable|array|max:20',
            'items.*.modifiers.*.modifier_id'   => 'required|integer|exists:modifiers,id',
            'items.*.modifiers.*.quantity'      => 'sometimes|integer|min:1|max:10',
        ];
    }
}
