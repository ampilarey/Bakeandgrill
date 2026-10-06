<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Support\SmsDeliveryRules;
use App\Mail\SmsCopyMail;
use App\Models\Customer;
use App\Models\SmsLog;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Throwable;

/**
 * An email copy of every text (owner, 2026-10-06: "not customers only.
 * Admin and all staffs too receive email in all the scenarios").
 *
 * Called by SmsService once a text has passed every rule (type switched on,
 * opt-outs, marketing cap, quiet hours), so the email follows the same
 * rules as the SMS. The copy goes to the address saved for that person:
 * the staff account for a staff or owner alert, the customer account
 * otherwise. One copy per log row however often the SMS is retried.
 */
class SmsEmailCopier
{
    /**
     * Types that already send their own, fuller email to the same person;
     * a copy of the text would be a second email about the same thing.
     */
    public const HAS_OWN_EMAIL = [
        'auth_customer_otp',            // CustomerOtpService emails the same code
        'customer_order_confirmed',     // OrderConfirmationMail
        'customer_payment_confirmed_online', // OrderConfirmationMail on payment
        'giftcard_delivery',            // GiftCardMail to the recipient
        'catering_request_received',    // EventRequestReceivedMail
        'catering_quote_customer',      // EventQuoteSentMail
        'catering_confirmed_customer',  // EventConfirmedMail
    ];

    private const RATE_KEY = 'sms-email-copy:hour';

    /** @param array<string, mixed>|null $registryEntry */
    public function copy(SmsMessage $sms, string $normalizedPhone, SmsLog $log, ?array $registryEntry): void
    {
        try {
            if (in_array($sms->type, self::HAS_OWN_EMAIL, true)) {
                return;
            }

            $category = (string) ($registryEntry['category'] ?? $sms->type);
            $marketing = $category === 'marketing';
            $staffAlert = $category === 'staff';

            $person = $this->recipient($sms, $normalizedPhone, $staffAlert);
            if ($person === null) {
                return;
            }
            [$email, $audience, $customerId] = $person;

            $rules = SmsDeliveryRules::all();
            $allowed = match (true) {
                $marketing => $rules['email_copy_marketing'] && $audience === 'customer',
                $audience === 'staff' => $rules['email_copy_staff'],
                default => $rules['email_copy_customers'],
            };
            if (!$allowed) {
                return;
            }

            // One copy per log row: a retried or released SMS reuses its row.
            if (!Cache::add('sms-email-copy:log:' . $log->id, 1, now()->addDays(2))) {
                return;
            }

            if (!$this->withinHourlyCap((int) $rules['email_copy_hourly_cap'], $marketing)) {
                Log::info('sms email copy: hourly cap reached, skipped', ['type' => $sms->type, 'log_id' => $log->id]);

                return;
            }

            $mail = new SmsCopyMail(
                message: $sms->message,
                type: $sms->type,
                label: (string) ($registryEntry['label'] ?? ''),
                audience: $marketing ? 'marketing' : $audience,
                phone: $normalizedPhone,
                customerId: $customerId,
            );

            // After the response (or the job), so a slow mail server never
            // holds up a checkout, a till or a campaign batch.
            DeferAfterResponse::run(function () use ($email, $mail, $log): void {
                try {
                    Mail::to($email)->send($mail);
                } catch (Throwable $e) {
                    Log::warning('sms email copy: send failed', ['log_id' => $log->id, 'error' => $e->getMessage()]);
                }
            }, 'sms-email-copy');
        } catch (Throwable $e) {
            // Never let the email copy affect the SMS.
            Log::warning('sms email copy: skipped after an error', ['type' => $sms->type, 'error' => $e->getMessage()]);
        }
    }

    /**
     * [email, 'staff'|'customer', customerId] for the person behind this
     * text, or null when nobody with an email is known.
     *
     * @return array{0: string, 1: string, 2: int|null}|null
     */
    private function recipient(SmsMessage $sms, string $normalizedPhone, bool $staffAlert): ?array
    {
        if ($sms->customerId !== null) {
            $email = $this->clean(Customer::whereKey($sms->customerId)->value('email'));
            if ($email !== null) {
                return [$email, 'customer', $sms->customerId];
            }
        }

        $local = substr(preg_replace('/\D/', '', $normalizedPhone) ?? '', -7);
        if (strlen($local) !== 7) {
            return null;
        }
        $forms = ['+960' . $local, '960' . $local, $local, '+960 ' . $local];

        $staff = fn (): ?array => ($u = User::query()->whereIn('phone', $forms)->where('is_active', true)->whereNotNull('email')->first())
            && ($e = $this->clean($u->email)) !== null ? [$e, 'staff', null] : null;
        $customer = fn (): ?array => ($c = Customer::query()->whereIn('phone', $forms)->whereNotNull('email')->first())
            && ($e = $this->clean($c->email)) !== null ? [$e, 'customer', $c->id] : null;

        // A staff alert goes to the staff account first; anything else to
        // the customer first (a cashier can also be a customer).
        return $staffAlert ? ($staff() ?? $customer()) : ($customer() ?? $staff());
    }

    private function withinHourlyCap(int $cap, bool $marketing): bool
    {
        if ($cap <= 0) {
            return true;
        }
        // Marketing may use half the hour's budget, so a campaign can never
        // crowd out order, payment and staff emails.
        $limit = $marketing ? max(1, intdiv($cap, 2)) : $cap;
        if (RateLimiter::attempts(self::RATE_KEY) >= $limit) {
            return false;
        }
        RateLimiter::hit(self::RATE_KEY, 3600);

        return true;
    }

    private function clean(mixed $email): ?string
    {
        $email = is_string($email) ? trim($email) : '';

        return $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
    }
}
