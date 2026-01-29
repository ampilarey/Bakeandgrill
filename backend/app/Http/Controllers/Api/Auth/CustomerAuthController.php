<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\OtpVerification;
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
            'phone' => 'required|string|regex:/^\+960[0-9]{7}$/', // Maldives phone format
        ]);

        $phone = $request->phone;

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

        // TODO: Send OTP via SMS (for now, log it)
        logger()->info('OTP Code for ' . $phone . ': ' . $otpCode);

        return response()->json([
            'message' => 'OTP sent successfully',
            'expires_in' => 600, // 10 minutes in seconds
            // In development, include OTP (REMOVE IN PRODUCTION)
            'otp' => config('app.debug') ? $otpCode : null,
        ]);
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

        // Find latest OTP for this phone
        $otpRecord = OtpVerification::where('phone', $request->phone)
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
            ['phone' => $request->phone],
            [
                'name' => $request->name ?? null,
                'email' => $request->email ?? null,
                'loyalty_points' => 0,
                'tier' => 'bronze',
            ]
        );

        $customer->update(['last_login_at' => now()]);

        // Create Sanctum token
        $token = $customer->createToken('customer-' . $customer->phone)->plainTextToken;

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
}
