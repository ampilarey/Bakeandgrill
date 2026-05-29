<?php

declare(strict_types=1);

namespace App\Domains\Customers\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Customer;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Validation\ValidationException;

final class CustomerSmsActionService
{
    public function __construct(private readonly SmsService $sms) {}

    public function sendDirect(Customer $customer, string $message, User $staff): SmsLog
    {
        if ($customer->sms_opt_out) {
            throw ValidationException::withMessages([
                'message' => ['This customer has opted out of SMS and cannot be contacted.'],
            ]);
        }

        if (trim($message) === '') {
            throw ValidationException::withMessages([
                'message' => ['Message is required.'],
            ]);
        }

        return $this->sms->send(new SmsMessage(
            to: $this->sms->normalizePhone($customer->phone),
            message: $message,
            type: 'admin_direct',
            customerId: $customer->id,
            referenceType: Customer::class,
            referenceId: (string) $customer->id,
            idempotencyKey: 'admin-direct:' . $customer->id . ':' . md5($message . now()->format('Y-m-d-H-i')),
        ));
    }
}
