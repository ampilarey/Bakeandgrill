<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\OtpVerification;
use App\Services\SmsService;
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
        $smsSent = $smsService->send($phone, $smsMessage);

        $dhiraagu = config('services.dhiraagu');
        $smsConfigured = !empty($dhiraagu['username']) && !empty($dhiraagu['password']);
        if (!$smsConfigured || !$smsSent) {
            session()->flash('otp_hint', "SMS not configured or failed. Use this code to login: {$otpCode}");
        } elseif (!app()->environment('production')) {
            session()->flash('otp_hint', "Dev OTP: {$otpCode}");
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
        $token = $customer->createToken('customer-' . $customer->phone, ['customer'])->plainTextToken;

        session([
            'customer_id' => $customer->id,
            'customer_name' => $customer->name ?: $customer->phone,
            'customer_phone' => $customer->phone,
            'customer_token' => $token, // Store token in session
        ]);

        // Redirect to intended page or menu
        $intendedUrl = session('intended_url', '/menu');
        session()->forget('intended_url');

        return redirect($intendedUrl)->with('message', 'Logged in successfully!');
    }

    public function logout(Request $request)
    {
        $request->session()->forget(['customer_id', 'customer_name', 'customer_phone']);

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
