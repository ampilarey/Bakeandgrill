<?php

declare(strict_types=1);

namespace App\Domains\Credit\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Customer;
use App\Models\SmsTemplate;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Texts the customer about their credit account (owner, 2026-10-03: "add
 * account approved, and any changes to the credit amount notified").
 *
 *  - approved       the account is opened, or reopened after being blocked
 *  - limit changed  the credit limit goes up or down
 *
 * Each is its own type in the SMS Control Center with its own switch, and
 * the wording is an editable template. Sent after the change is saved; a
 * failed send is logged and never undoes the change.
 */
class CreditAccountNotifier
{
    public const TYPE_APPROVED = 'customer_credit_approved';

    public const TYPE_LIMIT_CHANGED = 'customer_credit_limit_changed';

    public function __construct(
        private readonly SmsService $sms,
        private readonly CreditEligibilityService $eligibility,
    ) {}

    public function approved(Customer $customer): void
    {
        $vars = [
            'limit' => self::mvr((int) $customer->credit_limit_laar),
            'terms_days' => (string) (int) $customer->credit_payment_terms_days,
            'available' => self::mvr($this->eligibility->availableCreditLaar($customer)),
        ];

        $this->send(
            $customer,
            self::TYPE_APPROVED,
            $vars,
            'Bake & Grill: your credit account is approved. Limit MVR {{limit}}, pay each invoice within {{terms_days}} days. Thank you!',
            sprintf('credit:approved:%d:%s', $customer->id, $customer->credit_approved_at?->format('YmdHis') ?? now()->format('YmdHis')),
        );
    }

    public function limitChanged(Customer $customer, int $oldLimitLaar): void
    {
        $newLimitLaar = (int) $customer->credit_limit_laar;
        if ($newLimitLaar === $oldLimitLaar) {
            return;
        }

        $vars = [
            'limit' => self::mvr($newLimitLaar),
            'old_limit' => self::mvr($oldLimitLaar),
            'available' => self::mvr($this->eligibility->availableCreditLaar($customer)),
            'change' => $newLimitLaar > $oldLimitLaar ? 'increased' : 'reduced',
        ];

        $this->send(
            $customer,
            self::TYPE_LIMIT_CHANGED,
            $vars,
            'Bake & Grill: your credit limit has been {{change}} from MVR {{old_limit}} to MVR {{limit}}. Available now: MVR {{available}}.',
            sprintf('credit:limit:%d:%d:%d:%s', $customer->id, $oldLimitLaar, $newLimitLaar, now()->format('YmdHis')),
        );
    }

    /**
     * @param array<string, string> $vars
     */
    private function send(Customer $customer, string $type, array $vars, string $fallback, string $idempotencyKey): void
    {
        $phone = trim((string) $customer->phone);
        if ($phone === '') {
            return;
        }

        $body = SmsTemplate::query()->where('slug', $type)->value('body') ?: $fallback;
        foreach ($vars as $key => $value) {
            $body = str_replace('{{' . $key . '}}', $value, $body);
        }

        try {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $body,
                type: $type,
                customerId: $customer->id,
                referenceType: 'customer',
                referenceId: (string) $customer->id,
                idempotencyKey: $idempotencyKey,
            ));
        } catch (Throwable $e) {
            Log::warning('credit account SMS failed', ['type' => $type, 'customer_id' => $customer->id, 'error' => $e->getMessage()]);
        }
    }

    private static function mvr(int $laar): string
    {
        return number_format($laar / 100, 2, '.', ',');
    }
}
