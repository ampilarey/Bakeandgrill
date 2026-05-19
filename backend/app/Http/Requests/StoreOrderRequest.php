<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'type' => 'required|string|in:dine_in,takeaway,online_pickup',
            'print' => 'sometimes|boolean',
            'device_identifier' => 'nullable|string|max:255',
            'restaurant_table_id' => 'nullable|integer|exists:restaurant_tables,id',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'ticket_name' => 'nullable|string|max:80',
            'ticket_note' => 'nullable|string|max:255',
            // Offline sync idempotency key (POS PWA generates a UUID per
            // queued order). Persisted by OrderCreationService so a retry
            // hits the duplicate check in OfflineSyncController.
            'offline_id' => 'nullable|string|max:64',
            'notes' => 'nullable|string|max:1000',
            'customer_notes' => 'nullable|string|max:1000',
            'discount_amount' => 'nullable|numeric|min:0',
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|integer|exists:items,id',
            'items.*.variant_id' => 'nullable|integer|exists:variants,id',
            'items.*.quantity' => 'required|integer|min:1|max:999',
            'items.*.modifiers' => 'nullable|array',
            'items.*.modifiers.*.modifier_id' => 'required|integer|exists:modifiers,id',
            'items.*.modifiers.*.quantity' => 'nullable|integer|min:1',
            // Free-form kitchen note per line — currently populated by
            // the POS from the tap-chip `pos_quick_notes` library
            // (cashier picks one or more chips, the POS joins them
            // with " · " before sending). The schema accepts any
            // string up to 255 chars so it's also future-proof for
            // typed notes from other channels (e.g. online order).
            'items.*.notes' => 'nullable|string|max:255',
        ];
    }
}
