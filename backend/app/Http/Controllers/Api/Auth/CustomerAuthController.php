<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\OtpVerification;
use App\Services\SmsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class CustomerAuthController extends Controller
{
    /**
     * Request OTP code
     */
    public function requestOtp(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
        ]);

        // Normalize phone number (accept with or without +960)
        $phone = $this->normalizePhone($request->phone);

        // Validate normalized format
        if (!preg_match('/^\+960[0-9]{7}$/', $phone)) {
            throw ValidationException::withMessages([
                'phone' => ['Please enter a valid Maldivian phone number (7 digits or +960XXXXXXX)'],
            ]);
        }

        // Rate limiting: 3 OTP requests per hour per phone
        $key = 'otp-request:' . $phone;

        if (RateLimiter::tooManyAttempts($key, 3)) {
            $seconds = RateLimiter::availableIn($key);
            throw ValidationException::withMessages([
                'phone' => ['Too many OTP requests. Please try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        // Generate 6-digit OTP
        $otpCode = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        // Store OTP with 10-minute expiry
        OtpVerification::create([
            'phone' => $phone,
            'code_hash' => Hash::make($otpCode),
            'expires_at' => now()->addMinutes(10),
            'attempts' => 0,
        ]);

        // Hit rate limiter
        RateLimiter::hit($key, 3600); // 1 hour

        // Send OTP via SMS
        $smsService = app(SmsService::class);
        $smsMessage = "Your Bake & Grill verification code is {$otpCode}. Valid for 10 minutes. Do not share this code.";

        $smsSent = $smsService->send($phone, $smsMessage);

        // Log only in non-production for debugging (NEVER log OTP in production)
        if (!app()->environment('production')) {
            logger()->info('OTP requested', [
                'phone' => $phone,
                'otp' => $otpCode, // Only in dev
                'sms_sent' => $smsSent,
            ]);
        }

        $response = [
            'message' => 'OTP sent successfully',
            'expires_in' => 600, // 10 minutes in seconds
        ];

        // SECURITY: Only include OTP in local/dev/testing environments
        if (app()->environment(['local', 'testing']) && config('app.debug')) {
            $response['otp'] = $otpCode;
        }

        return response()->json($response);
    }

    /**
     * Verify OTP and login/register customer
     */
    public function verifyOtp(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'otp' => 'required|string|size:6',
        ]);

        // Normalize phone number to match format used in requestOtp
        $phone = $this->normalizePhone($request->phone);

        // Find latest OTP for this phone
        $otpRecord = OtpVerification::where('phone', $phone)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->orderBy('created_at', 'desc')
            ->first();

        if (!$otpRecord) {
            throw ValidationException::withMessages([
                'otp' => ['OTP expired or invalid.'],
            ]);
        }

        // Check attempts (max 5)
        if ($otpRecord->attempts >= 5) {
            throw ValidationException::withMessages([
                'otp' => ['Too many failed attempts. Please request a new OTP.'],
            ]);
        }

        // Verify OTP
        if (!Hash::check($request->otp, $otpRecord->code_hash)) {
            $otpRecord->increment('attempts');

            throw ValidationException::withMessages([
                'otp' => ['Invalid OTP code. ' . (5 - $otpRecord->attempts) . ' attempts remaining.'],
            ]);
        }

        // Mark OTP as used
        $otpRecord->update(['used_at' => now()]);

        // Find or create customer
        $customer = Customer::firstOrCreate(
            ['phone' => $phone],
            [
                'name' => $request->name ?? null,
                'email' => $request->email ?? null,
                'loyalty_points' => 0,
                'tier' => 'bronze',
            ],
        );

        $customer->update(['last_login_at' => now()]);

        // Create Sanctum token with 'customer' ability
        $token = $customer->createToken('customer-' . $customer->phone, ['customer'])->plainTextToken;

        return response()->json([
            'message' => 'Verified successfully',
            'token' => $token,
            'customer' => [
                'id' => $customer->id,
                'phone' => $customer->phone,
                'name' => $customer->name,
                'email' => $customer->email,
                'loyalty_points' => $customer->loyalty_points,
                'tier' => $customer->tier,
            ],
        ]);
    }

    /**
     * Normalize phone number to +960XXXXXXX format
     */
    private function normalizePhone(string $phone): string
    {
        // Remove all non-numeric characters except +
        $digits = preg_replace('/[^0-9+]/', '', $phone);

        // Remove + sign for processing
        $digitsOnly = str_replace('+', '', $digits);

        // If already has 960 prefix
        if (str_starts_with($digitsOnly, '960') && strlen($digitsOnly) === 10) {
            return '+' . $digitsOnly;
        }

        // If 7 digits, add 960 prefix
        if (strlen($digitsOnly) === 7) {
            return '+960' . $digitsOnly;
        }

        // If 10 digits starting with 960
        if (strlen($digitsOnly) === 10 && str_starts_with($digitsOnly, '960')) {
            return '+' . $digitsOnly;
        }

        // Default: assume it's 7 digits and add prefix
        return '+960' . substr($digitsOnly, -7);
    }
}
