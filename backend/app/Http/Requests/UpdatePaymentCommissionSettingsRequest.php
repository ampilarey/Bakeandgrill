<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Payments\Services\PaymentCommissionService;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePaymentCommissionSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'enabled' => 'required|boolean',
            'pos_card_rate_bp' => 'required|integer|min:0|max:' . PaymentCommissionService::MAX_RATE_BP,
            'online_gateway_rate_bp' => 'required|integer|min:0|max:' . PaymentCommissionService::MAX_RATE_BP,
        ];
    }
}
