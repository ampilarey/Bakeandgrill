<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ApproveRefundRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'otp' => 'sometimes|nullable|string|max:12',
            // Owner-only: complete without customer OTP (tourist / undeliverable SMS).
            'owner_override_without_otp' => 'sometimes|boolean',
        ];
    }
}
