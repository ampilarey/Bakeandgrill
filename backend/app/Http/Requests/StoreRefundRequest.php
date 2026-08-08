<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Finance\Services\RefundWorkflowService;
use App\Rules\MaldivesPhone;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreRefundRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Gate checked in controller / middleware
    }

    public function rules(): array
    {
        return [
            'amount' => 'required|numeric|min:0.01',
            'reason_category' => 'required|string|in:'.implode(',', RefundWorkflowService::REASON_CATEGORIES),
            'reason' => 'required|string|min:1|max:1000',
            'cash_refund_override' => 'sometimes|boolean',
            // Walk-in only: add a number when the order has none. Never used to
            // overwrite an existing order/customer phone (enforced in workflow).
            'refund_phone' => ['sometimes', 'nullable', 'string', new MaldivesPhone],
            // Explicitly reject any client attempt to redirect SMS or mutate contacts.
            'phone' => 'prohibited',
            'customer_phone' => 'prohibited',
            'to' => 'prohibited',
            'sms_to' => 'prohibited',
            'delivery_contact_phone' => 'prohibited',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
            if ($this->has('status')) {
                $v->errors()->add(
                    'status',
                    'Refund status cannot be set by the client.',
                );
            }
            $category = (string) $this->input('reason_category', '');
            $reason = trim((string) $this->input('reason', ''));
            if ($category === 'other' && strlen($reason) < 3) {
                $v->errors()->add('reason', 'Please describe the reason when category is Other.');
            }
        });
    }
}
