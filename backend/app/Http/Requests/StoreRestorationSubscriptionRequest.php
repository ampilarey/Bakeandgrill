<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Rules\MaldivesPhone;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Restoration notify-me signup request (plan §14 / Stage 6).
 *
 * Deliberately public — no auth. Rate-limited at the route layer
 * (throttle:5,1) and IP-hashed downstream to prevent enumeration
 * spam. `service_key` must be a known public key; internal keys
 * (POS/KDS/etc.) are rejected so we can never sign someone up for
 * a lockdown-restore alert.
 */
class StoreRestorationSubscriptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $publicKeys = array_keys(array_filter(
            config('service_availability.keys', []),
            static fn ($meta) => ($meta['group'] ?? 'public') === 'public',
        ));

        return [
            'service_key' => ['required', 'string', Rule::in($publicKeys)],
            'mobile' => ['required', 'string', new MaldivesPhone],
            'incident_id' => ['nullable', 'integer', 'exists:service_incidents,id'],
        ];
    }
}
