<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrderPaymentsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'payments' => 'required|array|min:1',
            'print_receipt' => 'sometimes|boolean',
            'payments.*.method' => 'required|string|max:50',
            // Allow 0.00 here so a fully-discounted ticket (100% promo
            // / loyalty / gift card / complimentary ring) can be
            // settled. The POS sends a single { method: "cash",
            // amount: 0 } row in that case and the controller's
            // paid_total >= order_total check still flips status to
            // paid. Without this, the cashier hit Charge → "Payment
            // failed: payments.0.amount must be at least 0.01" with
            // no good recovery path. We still gate non-zero rows on
            // numeric/min:0 — negative tenders never make sense.
            'payments.*.amount' => 'required|numeric|min:0',
            // status is intentionally ignored — derived server-side from payment method
            'payments.*.reference_number' => 'nullable|string|max:255',
        ];
    }
}
