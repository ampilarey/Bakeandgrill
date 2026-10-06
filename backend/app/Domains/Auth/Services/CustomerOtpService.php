<?php

declare(strict_types=1);

namespace App\Domains\Auth\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Mail\CustomerOtpMail;
use App\Models\Customer;
use App\Models\OtpVerification;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

/**
 * Single source of truth for customer OTP issue / verify / attempt-cap / consume.
 * Used by both the Blade portal and the API auth controllers so protections cannot drift.
 */
class CustomerOtpService
{
    public const MAX_ATTEMPTS = 5;

    public const TTL_MINUTES = 10;

    /**
     * Purpose groups — an OTP may only be consumed by a verify path in the
     * SAME group it was issued for. A reset OTP must never authenticate a
     * login, and a login OTP must never reset a password.
     */
    public const LOGIN_PURPOSES = ['login', 'register', 'web-login'];

    public const RESET_PURPOSES = ['reset_password', 'web-reset'];

    public function __construct(
        private readonly SmsService $smsService,
        private readonly CustomerSmsMessageBuilder $smsBuilder,
    ) {}

    /**
     * Mint a new OTP row and deliver it (SMS or email). Returns the plaintext code.
     */
    public function issue(
        string $phone,
        string $purpose = 'login',
        string $channel = 'sms',
        ?string $email = null,
        ?string $smsFallback = null,
    ): string {
        $otpCode = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $channel = $channel === 'email' ? 'email' : 'sms';

        $otpRow = OtpVerification::create([
            'phone' => $phone,
            'channel' => $channel,
            'email' => $channel === 'email' ? $email : null,
            'purpose' => $purpose,
            'code_hash' => Hash::make($otpCode),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
            'attempts' => 0,
        ]);

        if ($channel === 'email') {
            try {
                Mail::to((string) $email)->send(new CustomerOtpMail($otpCode, self::TTL_MINUTES));
            } catch (\Throwable $e) {
                // Only the newest code counts, so a row for an email that
                // never left would cancel the SMS code the customer already
                // has. Drop it and say so instead of a bare server error.
                $otpRow->delete();
                logger()->warning('OTP email could not be sent', ['phone' => $phone, 'error' => $e->getMessage()]);

                throw ValidationException::withMessages([
                    'email' => ['We could not send the email just now. Please use the code we texted you.'],
                ]);
            }

            return $otpCode;
        }

        $fallback = $smsFallback ?? "Your Bake & Grill verification code is {$otpCode}. Valid for 10 minutes. Do not share this code.";
        $smsMessage = $this->smsBuilder->build(
            'auth_customer_otp',
            ['code' => $otpCode, 'minutes' => (string) self::TTL_MINUTES, 'brand' => 'Bake & Grill'],
            $fallback,
        );

        // Idempotency key must be unique per OTP row, otherwise back-to-back
        // requests in the same minute share a key and SmsService::send() drops
        // the SMS as a duplicate — the OtpVerification row stays in DB and the
        // customer fails verification on a code they never received.
        $this->smsService->send(new SmsMessage(
            to: $phone,
            message: $smsMessage,
            type: 'auth_customer_otp',
            referenceType: 'otp',
            referenceId: (string) $otpRow->id,
            idempotencyKey: 'otp:' . $purpose . ':' . $phone . ':' . $otpRow->id,
        ));

        // Owner, 2026-10-06: "automatic same otp to mail with sms if there is
        // email reg in the acc". The SAME code also goes to the email already
        // on this phone's account (never an address from the request), so the
        // customer can use whichever arrives first. Sent after the response
        // so a slow mail server never holds up the SMS step; a failure is
        // logged and the SMS code is unaffected.
        $email = $this->accountEmail($phone);
        if ($email !== null) {
            $otpRow->forceFill(['email' => $email])->save();
            DeferAfterResponse::run(function () use ($email, $otpCode, $phone): void {
                try {
                    Mail::to($email)->send(new CustomerOtpMail($otpCode, self::TTL_MINUTES));
                } catch (\Throwable $e) {
                    logger()->warning('OTP copy by email could not be sent', ['phone' => $phone, 'error' => $e->getMessage()]);
                }
            }, 'otp-email-copy');
        }

        return $otpCode;
    }

    /** The email saved on this phone's customer account, or null. */
    public function accountEmail(string $phone): ?string
    {
        $email = Customer::where('phone', $phone)->value('email');
        $email = is_string($email) ? trim($email) : '';

        return $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
    }

    /**
     * How many live codes one phone may have at once. Two covers the texted
     * code plus "Email me the code instead" (owner, 2026-10-06: entered the
     * SMS code after also asking for the email one and was refused). Kept
     * small: every wrong guess counts against each code it was checked
     * against, and request rate limits cap how many codes exist at all.
     */
    public const LIVE_CODES = 2;

    /**
     * Verify a code against the newest unused, unexpired OTPs for the phone
     * (at most LIVE_CODES) and, on a match, mark all of them used so neither
     * can be replayed.
     *
     * @param  list<string>|null  $allowedPurposes  Only match OTPs issued for
     *         one of these purposes. Null keeps legacy any-purpose behaviour
     *         and must not be used for auth-sensitive flows.
     *
     * @throws ValidationException
     */
    public function verifyAndConsume(string $phone, string $code, ?array $allowedPurposes = null): void
    {
        // Order by `id` (auto-increment, monotonic) rather than `created_at`
        // (second-precision timestamp) so two requests within the same wall-
        // clock second still resolve deterministically.
        $live = OtpVerification::where('phone', $phone)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->when($allowedPurposes !== null, fn ($q) => $q->whereIn('purpose', $allowedPurposes))
            ->orderByDesc('id')
            ->limit(self::LIVE_CODES)
            ->get();

        if ($live->isEmpty()) {
            throw ValidationException::withMessages([
                'otp' => ['That code has expired. Please ask for a new one.'],
            ]);
        }

        $usable = $live->filter(fn (OtpVerification $row) => $row->attempts < self::MAX_ATTEMPTS);
        if ($usable->isEmpty()) {
            throw ValidationException::withMessages([
                'otp' => ['Too many wrong tries. Please ask for a new code.'],
            ]);
        }

        $match = $usable->first(fn (OtpVerification $row) => Hash::check($code, $row->code_hash));

        if ($match === null) {
            foreach ($usable as $row) {
                $row->increment('attempts');
            }
            $left = self::MAX_ATTEMPTS - (int) $usable->max('attempts');
            throw ValidationException::withMessages([
                'otp' => [$left > 0
                    ? 'That code is not right. ' . $left . ($left === 1 ? ' try' : ' tries') . ' left.'
                    : 'Too many wrong tries. Please ask for a new code.'],
            ]);
        }

        OtpVerification::whereIn('id', $live->pluck('id'))->update(['used_at' => now()]);
    }
}
