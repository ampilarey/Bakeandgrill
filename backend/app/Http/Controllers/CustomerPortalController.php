<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\OtpVerification;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class CustomerPortalController extends Controller
{
    public function showLogin()
    {
        return view('customer.login');
    }

    public function requestOtp(Request $request)
    {
        $request->validate(['phone' => 'required|string']);

        $phone = $this->normalizePhone($request->phone);

        if (!preg_match('/^\+960[0-9]{7}$/', $phone)) {
            return back()->withErrors(['phone' => 'Please enter a valid Maldivian phone number']);
        }

        $key = 'otp-web-request:' . $phone;

        if (RateLimiter::tooManyAttempts($key, 3)) {
            $seconds = RateLimiter::availableIn($key);

            return back()->withErrors(['phone' => 'Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.']);
        }

        $otpCode = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        OtpVerification::create([
            'phone' => $phone,
            'code_hash' => Hash::make($otpCode),
            'expires_at' => now()->addMinutes(10),
            'attempts' => 0,
        ]);

        RateLimiter::hit($key, 3600);

        // Send SMS
        $smsService = app(SmsService::class);
        $smsMessage = "Your Bake & Grill verification code is {$otpCode}. Valid for 10 minutes.";
        $log = $smsService->send(new SmsMessage(to: $phone, message: $smsMessage, type: 'otp'));
        $smsSent = in_array($log->status, ['sent', 'demo'], true);

        // In non-production, hint is safe for developers (never reveal OTP in production)
        if (!app()->environment('production') && !$smsSent) {
            session()->flash('otp_hint', "Dev mode – SMS not sent. OTP: {$otpCode}");
        }

        return back()->with('otp_requested', true)->with('phone', $phone);
    }

    public function verifyOtp(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'otp' => 'required|string|size:6',
        ]);

        $phone = $this->normalizePhone($request->phone);

        // Rate limit OTP verification attempts (5 per 10 minutes per phone)
        $verifyKey = 'otp-web-verify:' . $phone;
        if (RateLimiter::tooManyAttempts($verifyKey, 5)) {
            $seconds = RateLimiter::availableIn($verifyKey);
            return back()->withErrors(['otp' => 'Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.']);
        }
        RateLimiter::hit($verifyKey, 600);

        $otpRecord = OtpVerification::where('phone', $phone)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->orderBy('created_at', 'desc')
            ->first();

        if (!$otpRecord || !Hash::check($request->otp, $otpRecord->code_hash)) {
            return back()->withErrors(['otp' => 'Invalid or expired OTP']);
        }

        $otpRecord->update(['used_at' => now()]);

        $customer = Customer::firstOrCreate(
            ['phone' => $phone],
            ['loyalty_points' => 0, 'tier' => 'bronze'],
        );

        $customer->update(['last_login_at' => now()]);

        // Create Sanctum token for API/React app use
        $token = $customer->createToken('customer-portal', ['customer'])->plainTextToken;

        session([
            'customer_id' => $customer->id,
            'customer_name' => $customer->name ?: $customer->phone,
            'customer_phone' => $customer->phone,
            'customer_token' => $token,
        ]);

        // Validate intended URL to prevent open redirect
        $intendedUrl = session('intended_url', '/menu');
        session()->forget('intended_url');
        if (!is_string($intendedUrl) || !str_starts_with($intendedUrl, '/')) {
            $intendedUrl = '/menu';
        }

        return redirect($intendedUrl)->with('message', 'Logged in successfully!');
    }

    public function logout(Request $request)
    {
        // Revoke the Sanctum token so it cannot be reused after logout
        $token = $request->session()->get('customer_token');
        if ($token) {
            $customerId = $request->session()->get('customer_id');
            if ($customerId) {
                $customer = \App\Models\Customer::find($customerId);
                $customer?->tokens()->where('name', 'customer-portal')->delete();
            }
        }

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/')->with('message', 'Logged out successfully');
    }

    private function normalizePhone(string $phone): string
    {
        $digitsOnly = preg_replace('/[^0-9]/', '', $phone);

        if (str_starts_with($digitsOnly, '960') && strlen($digitsOnly) === 10) {
            return '+' . $digitsOnly;
        }

        if (strlen($digitsOnly) === 7) {
            return '+960' . $digitsOnly;
        }

        return '+960' . substr($digitsOnly, -7);
    }
}
