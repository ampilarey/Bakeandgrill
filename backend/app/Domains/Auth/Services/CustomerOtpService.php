<?php

declare(strict_types=1);

namespace App\Domains\Auth\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Mail\CustomerOtpMail;
use App\Models\OtpVerification;
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
            'code_hash' => Hash::make($otpCode),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
            'attempts' => 0,
        ]);

        if ($channel === 'email') {
            Mail::to((string) $email)->send(new CustomerOtpMail($otpCode, self::TTL_MINUTES));

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

        return $otpCode;
    }

    /**
     * Verify the newest unused OTP for the phone and mark it used.
     *
     * @throws ValidationException
     */
    public function verifyAndConsume(string $phone, string $code): void
    {
        // Order by `id` (auto-increment, monotonic) rather than `created_at`
        // (second-precision timestamp) so two requests within the same wall-
        // clock second still resolve to a deterministic newest row.
        $otpRecord = OtpVerification::where('phone', $phone)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->orderByDesc('id')
            ->first();

        if (!$otpRecord) {
            throw ValidationException::withMessages([
                'otp' => ['OTP expired or invalid. Please request a new one.'],
            ]);
        }

        if ($otpRecord->attempts >= self::MAX_ATTEMPTS) {
            throw ValidationException::withMessages([
                'otp' => ['Too many failed attempts. Please request a new OTP.'],
            ]);
        }

        if (!Hash::check($code, $otpRecord->code_hash)) {
            $otpRecord->increment('attempts');
            throw ValidationException::withMessages([
                'otp' => ['Invalid OTP code. ' . (self::MAX_ATTEMPTS - $otpRecord->attempts) . ' attempts remaining.'],
            ]);
        }

        $otpRecord->update(['used_at' => now()]);
    }
}
