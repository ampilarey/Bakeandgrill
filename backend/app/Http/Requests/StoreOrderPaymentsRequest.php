<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreOrderPaymentsRequest extends FormRequest
{
    /**
     * Whitelist of payment methods the POS endpoint accepts. Anything
     * outside this set is rejected with a 422 — previously any string
     * up to 50 chars passed validation, which meant a typo / future
     * frontend bug could persist garbage like "venmo" or "bml-pay" and
     * silently drift the payments ledger.
     *
     * Keep in sync with the gateway dispatch in OrderPaymentController::addPayments —
     * 'bml_pay', 'bml', 'online' there map to async confirmation.
     */
    public const ALLOWED_METHODS = [
        'cash',
        'card',
        'card_pos',
        'qr',
        'bank_transfer',
        'bml_pay',
        'bml',
        'online',
        'wallet',
        'customer_deposit',
        'cheque',
        'house_account',
        'gift_card',
    ];

    protected function prepareForValidation(): void
    {
        $payments = $this->input('payments', []);
        if (!is_array($payments)) {
            return;
        }

        foreach ($payments as $i => $row) {
            if (($row['method'] ?? '') === 'customer_deposit') {
                $payments[$i]['method'] = 'wallet';
            }
        }

        $this->merge(['payments' => $payments]);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'payments' => 'required|array|min:1',
            'print_receipt' => 'sometimes|boolean',
            // Method must be one of the whitelisted strings. Surfaced as
            // a clear 422 to the POS so a typo can't ring up an order
            // with an unrecognised tender type.
            'payments.*.method' => ['required', 'string', \Illuminate\Validation\Rule::in(self::ALLOWED_METHODS)],
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
            'payments.*.idempotency_key' => 'nullable|string|max:128',
        ];
    }
}
