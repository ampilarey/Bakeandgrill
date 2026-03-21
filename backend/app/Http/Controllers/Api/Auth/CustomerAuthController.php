<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Domains\Notifications\DTOs\CustomerCreatedData;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Events\CustomerCreated;
use App\Domains\Notifications\Services\SmsService;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OtpVerification;
use App\Rules\MaldivesPhone;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class CustomerAuthController extends Controller
{
    // ── Shared helpers ────────────────────────────────────────────────────────

    private function normalizePhone(string $phone): string
    {
        return MaldivesPhone::normalize($phone);
    }

    private function customerResponse(Customer $customer, string $token): array
    {
        return [
            'id' => $customer->id,
            'phone' => $customer->phone,
            'name' => $customer->name,
            'email' => $customer->email,
            'loyalty_points' => $customer->loyalty_points,
            'tier' => $customer->tier,
            'is_profile_complete' => (bool) $customer->is_profile_complete,
        ];
    }

    private function sendOtp(string $phone, string $purpose = 'login'): string
    {
        $otpCode = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        OtpVerification::create([
            'phone' => $phone,
            'code_hash' => Hash::make($otpCode),
            'expires_at' => now()->addMinutes(10),
            'attempts' => 0,
        ]);

        $smsService = app(SmsService::class);
        $smsMessage = "Your Bake & Grill verification code is {$otpCode}. Valid for 10 minutes. Do not share this code.";

        $smsService->send(new SmsMessage(
            to: $phone,
            message: $smsMessage,
            type: 'otp',
            referenceType: 'otp',
            referenceId: (string) OtpVerification::where('phone', $phone)->latest()->value('id'),
            idempotencyKey: 'otp:' . $purpose . ':' . $phone . ':' . now()->format('YmdHi'),
        ));

        return $otpCode;
    }

    private function verifyAndConsumeOtp(string $phone, string $code): void
    {
        $otpRecord = OtpVerification::where('phone', $phone)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->orderBy('created_at', 'desc')
            ->first();

        if (!$otpRecord) {
            throw ValidationException::withMessages([
                'otp' => ['OTP expired or invalid. Please request a new one.'],
            ]);
        }

        if ($otpRecord->attempts >= 5) {
            throw ValidationException::withMessages([
                'otp' => ['Too many failed attempts. Please request a new OTP.'],
            ]);
        }

        if (!Hash::check($code, $otpRecord->code_hash)) {
            $otpRecord->increment('attempts');
            throw ValidationException::withMessages([
                'otp' => ['Invalid OTP code. ' . (5 - $otpRecord->attempts) . ' attempts remaining.'],
            ]);
        }

        $otpRecord->update(['used_at' => now()]);
    }

    // ── Public endpoints ──────────────────────────────────────────────────────

    /**
     * Check whether a phone number has an account and has set a password.
     * Used by the React app to decide whether to show the password field or OTP flow.
     */
    public function checkPhone(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
        ]);

        $phone = $this->normalizePhone($request->phone);
        $customer = Customer::where('phone', $phone)->first();

        return response()->json([
            'exists' => $customer !== null,
            'has_password' => $customer !== null && !empty($customer->password),
        ]);
    }

    /**
     * Password-based login for returning customers.
     */
    public function passwordLogin(Request $request)
    {
        $input = $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
            'password' => 'required|string',
        ]);

        $phone = $this->normalizePhone($input['phone']);
        $customer = Customer::where('phone', $phone)->first();

        if (!$customer || empty($customer->password) || !Hash::check($input['password'], $customer->password)) {
            throw ValidationException::withMessages([
                'phone' => ['Invalid phone number or password.'],
            ]);
        }

        if (!$customer->is_active) {
            throw ValidationException::withMessages([
                'phone' => ['This account has been deactivated. Please contact support.'],
            ]);
        }

        $customer->update(['last_login_at' => now()]);

        $customer->tokens()->where('name', 'like', 'customer-%')->delete();
        $token = $customer->createToken('customer-' . $customer->phone, ['customer'])->plainTextToken;

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'customer' => $this->customerResponse($customer, $token),
        ]);
    }

    /**
     * Request OTP — for new customers or password reset.
     */
    public function requestOtp(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
            'purpose' => 'nullable|string|in:register,reset_password',
        ]);

        $phone = $this->normalizePhone($request->phone);
        $purpose = $request->input('purpose', 'register');

        // Block returning customers with a password from using OTP to "register" —
        // they should use password login instead. For password reset it's always allowed.
        // Soft-deleted customers are allowed through OTP so they can recover their account.
        if ($purpose === 'register') {
            $customer = Customer::where('phone', $phone)->first();
            if ($customer && !empty($customer->password)) {
                throw ValidationException::withMessages([
                    'phone' => ['This number already has an account. Please log in with your password, or use "Forgot password?" to reset it.'],
                ]);
            }
        }

        $key = 'otp-request:' . $phone;

        if (RateLimiter::tooManyAttempts($key, 3)) {
            $seconds = RateLimiter::availableIn($key);
            throw ValidationException::withMessages([
                'phone' => ['Too many OTP requests. Please try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        RateLimiter::hit($key, 3600);

        $otpCode = $this->sendOtp($phone, $purpose);

        if (!app()->environment('production')) {
            logger()->info('OTP requested', ['phone' => $phone, 'otp' => $otpCode, 'purpose' => $purpose]);
        }

        $response = [
            'message' => 'OTP sent successfully',
            'expires_in' => 600,
        ];

        if (app()->environment(['local', 'testing']) && config('app.debug')) {
            $response['otp'] = $otpCode;
        }

        return response()->json($response);
    }

    /**
     * Verify OTP and log in / register the customer.
     */
    public function verifyOtp(Request $request)
    {
        $input = $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
            'otp' => 'required|string|size:6',
            'name' => 'nullable|string|max:100',
            'email' => 'nullable|email|max:100',
        ]);

        $phone = $this->normalizePhone($input['phone']);

        $this->verifyAndConsumeOtp($phone, $input['otp']);

        // Include soft-deleted rows so we don't hit a unique constraint violation
        // when a customer who was admin-deleted tries to log back in via OTP.
        $existing = Customer::withTrashed()->where('phone', $phone)->first();

        if ($existing && $existing->trashed()) {
            // Restore the soft-deleted account — OTP proves ownership of the phone.
            $existing->restore();
            $existing->update(['is_active' => true]);
            $customer = $existing;
        } elseif ($existing) {
            $customer = $existing;
            if (!$customer->is_active) {
                throw ValidationException::withMessages([
                    'phone' => ['This account has been deactivated. Please contact support.'],
                ]);
            }
        } else {
            $customer = Customer::create([
                'phone' => $phone,
                'name' => $input['name'] ?? null,
                'email' => $input['email'] ?? null,
                'loyalty_points' => 0,
                'tier' => 'bronze',
            ]);
        }

        $isNew = $customer->wasRecentlyCreated;

        if ($isNew) {
            event(new CustomerCreated(new CustomerCreatedData(
                customerId: $customer->id,
                phone: $customer->phone,
                name: $customer->name,
            )));
        }

        $customer->update(['last_login_at' => now()]);

        $customer->tokens()->where('name', 'like', 'customer-%')->delete();
        $token = $customer->createToken('customer-' . $customer->phone, ['customer'])->plainTextToken;

        return response()->json([
            'message' => 'Verified successfully',
            'token' => $token,
            'is_new_customer' => $isNew,
            'customer' => $this->customerResponse($customer, $token),
        ]);
    }

    /**
     * Check if the customer is already authenticated via session cookie.
     * Called by the React app on mount to auto-login customers who logged in on the Blade site.
     * If authenticated, issues a fresh Sanctum token for use in subsequent API calls.
     */
    public function check(Request $request)
    {
        $customer = Auth::guard('customer')->user();

        if (!$customer instanceof Customer) {
            return response()->json(['authenticated' => false], 401);
        }

        if (!$customer->is_active) {
            return response()->json(['authenticated' => false, 'message' => 'Account deactivated.'], 403);
        }

        $customer->tokens()->where('name', 'like', 'customer-%')->delete();
        $token = $customer->createToken('customer-' . $customer->phone, ['customer'])->plainTextToken;

        return response()->json([
            'authenticated' => true,
            'token' => $token,
            'customer' => $this->customerResponse($customer, $token),
        ]);
    }

    /**
     * Revoke the current token and log the customer out of the React app.
     * Called by the React order app before clearing localStorage auth state.
     */
    public function logout(Request $request)
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json(['message' => 'Logged out successfully'], 200);
    }

    /**
     * Send OTP for password reset (returns customer to OTP verify → reset-password).
     */
    public function forgotPassword(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
        ]);

        $phone = $this->normalizePhone($request->phone);

        $key = 'otp-request:' . $phone;

        if (RateLimiter::tooManyAttempts($key, 3)) {
            $seconds = RateLimiter::availableIn($key);
            throw ValidationException::withMessages([
                'phone' => ['Too many requests. Please try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        RateLimiter::hit($key, 3600);

        $otpCode = $this->sendOtp($phone, 'reset_password');

        if (!app()->environment('production')) {
            logger()->info('Password reset OTP requested', ['phone' => $phone, 'otp' => $otpCode]);
        }

        $response = [
            'message' => 'Password reset code sent',
            'expires_in' => 600,
        ];

        if (app()->environment(['local', 'testing']) && config('app.debug')) {
            $response['otp'] = $otpCode;
        }

        return response()->json($response);
    }

    /**
     * Verify OTP and set a new password (password reset flow).
     */
    public function resetPassword(Request $request)
    {
        $input = $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
            'otp' => 'required|string|size:6',
            'password' => 'required|string|min:6|confirmed',
            'password_confirmation' => 'required|string',
        ]);

        $phone = $this->normalizePhone($input['phone']);

        $this->verifyAndConsumeOtp($phone, $input['otp']);

        $customer = Customer::where('phone', $phone)->first();

        if (!$customer) {
            throw ValidationException::withMessages([
                'phone' => ['No account found for this phone number.'],
            ]);
        }

        $customer->update([
            'password' => Hash::make($input['password']),
            'last_login_at' => now(),
        ]);

        $customer->tokens()->where('name', 'like', 'customer-%')->delete();
        $token = $customer->createToken('customer-' . $customer->phone, ['customer'])->plainTextToken;

        return response()->json([
            'message' => 'Password reset successfully',
            'token' => $token,
            'customer' => $this->customerResponse($customer, $token),
        ]);
    }
}
