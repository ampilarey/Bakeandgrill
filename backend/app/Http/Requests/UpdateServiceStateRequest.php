<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Validates PATCH /api/admin/service-availability/{key}.
 *
 * Additional authorization is enforced by route middleware
 * (permission:service_availability.manage_public / manage_internal /
 * emergency). This class enforces the semantic rules: allowed status
 * enum, reason enum, message length, and typed confirmation for
 * high-impact keys.
 */
class UpdateServiceStateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $statuses = config('service_availability.statuses');
        $reasons = config('service_availability.reason_types');

        return [
            'status' => ['sometimes', 'string', Rule::in($statuses)],
            'reason_type' => ['sometimes', 'nullable', 'string', Rule::in($reasons)],
            'public_message' => ['sometimes', 'nullable', 'string', 'max:500'],
            'internal_note' => ['sometimes', 'nullable', 'string', 'max:500'],
            'alternatives' => ['sometimes', 'nullable', 'array'],
            'alternatives.*' => ['string', 'max:32'],
            'starts_at' => ['sometimes', 'nullable', 'date'],
            'ends_at' => ['sometimes', 'nullable', 'date'],
            'notify_enabled' => ['sometimes', 'boolean'],
            'allow_existing_operations' => ['sometimes', 'boolean'],
            'allow_admin_bypass' => ['sometimes', 'boolean'],
            'confirmation' => ['sometimes', 'string', 'max:64'],
        ];
    }

    /**
     * Strip HTML from user copy so a Blade/React render can't ever inject
     * markup. §13 says these are plain text; length is capped in rules.
     */
    protected function passedValidation(): void
    {
        $updates = [];
        foreach (['public_message', 'internal_note'] as $field) {
            if ($this->has($field) && is_string($this->input($field))) {
                $updates[$field] = strip_tags((string) $this->input($field));
            }
        }
        if ($updates) {
            $this->merge($updates);
        }
    }

    protected function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $status = $this->input('status');
            $key = $this->route('key');
            $emergencyStatuses = ['emergency_disabled'];
            $high = ['pos_sales', 'kds_operations', 'delivery_operations', 'emergency_write_lock'];

            $needsConfirmation = (is_string($status) && in_array($status, $emergencyStatuses, true))
                || (is_string($key) && in_array($key, $high, true) && $status && $status !== 'available');

            if ($needsConfirmation) {
                $confirmation = trim((string) $this->input('confirmation', ''));
                if (strtoupper($confirmation) !== 'EMERGENCY LOCKDOWN') {
                    $v->errors()->add('confirmation', 'Type EMERGENCY LOCKDOWN to confirm this high-impact change.');
                }
            }
        });
    }

    protected function failedValidation(Validator $validator): void
    {
        throw new ValidationException($validator);
    }
}
