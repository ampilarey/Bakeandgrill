<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\OtpVerification;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class CustomerPortalController extends Controller
{
    public function showLogin()
    {
        // If already logged in via session, redirect immediately
        if (Auth::guard('customer')->check()) {
            return redirect('/order/menu');
        }

        return view('customer.login');
    }

    // ── Step 1: Phone submitted — check if returning customer or new ─────────

    public function requestOtp(Request $request)
    {
        $request->validate(['phone' => 'required|string']);

        $phone = $this->normalizePhone($request->phone);

        if (! preg_match('/^\+960[0-9]{7}$/', $phone)) {
            return back()->withErrors(['phone' => 'Please enter a valid Maldivian phone number']);
        }

        // Returning customer with a password → show password form (no SMS cost)
        $customer = Customer::where('phone', $phone)->first();
        if ($customer && ! empty($customer->password)) {
            return back()
                ->with('password_step', true)
                ->with('phone', $phone);
        }

        // New customer or no password → send OTP
        $key = 'otp-request:' . $phone;

        if (RateLimiter::tooManyAttempts($key, 3)) {
            $seconds = RateLimiter::availableIn($key);

            return back()->withErrors(['phone' => 'Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.']);
        }

        RateLimiter::hit($key, 3600);

        $otpCode = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        OtpVerification::create([
            'phone'      => $phone,
            'code_hash'  => Hash::make($otpCode),
            'expires_at' => now()->addMinutes(10),
            'attempts'   => 0,
        ]);

        $smsService = app(SmsService::class);
        $smsMessage = "Your Bake & Grill verification code is {$otpCode}. Valid for 10 minutes.";
        $log        = $smsService->send(new SmsMessage(to: $phone, message: $smsMessage, type: 'otp'));
        $smsSent    = in_array($log->status, ['sent', 'demo'], true);

        if (! app()->environment('production') && ! $smsSent) {
            session()->flash('otp_hint', "Dev mode – SMS not sent. OTP: {$otpCode}");
        }

        return back()->with('otp_requested', true)->with('phone', $phone);
    }

    // ── Forgot password ───────────────────────────────────────────────────────

    public function showForgotPassword()
    {
        return view('customer.forgot-password');
    }

    public function forgotPassword(Request $request)
    {
        $request->validate(['phone' => 'required|string']);

        $phone = $this->normalizePhone($request->phone);

        if (! preg_match('/^\+960[0-9]{7}$/', $phone)) {
            return back()->withErrors(['phone' => 'Please enter a valid Maldivian phone number']);
        }

        $key = 'otp-request:' . $phone;

        if (RateLimiter::tooManyAttempts($key, 3)) {
            $seconds = RateLimiter::availableIn($key);
            return back()->withErrors(['phone' => 'Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.']);
        }

        RateLimiter::hit($key, 3600);

        $otpCode = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        OtpVerification::create([
            'phone'      => $phone,
            'code_hash'  => Hash::make($otpCode),
            'expires_at' => now()->addMinutes(10),
            'attempts'   => 0,
        ]);

        $smsService = app(SmsService::class);
        $smsMessage = "Your Bake & Grill password reset code is {$otpCode}. Valid for 10 minutes.";
        $log        = $smsService->send(new SmsMessage(to: $phone, message: $smsMessage, type: 'otp'));
        $smsSent    = in_array($log->status, ['sent', 'demo'], true);

        if (! app()->environment('production') && ! $smsSent) {
            session()->flash('otp_hint', "Dev mode – SMS not sent. OTP: {$otpCode}");
        }

        return back()
            ->with('reset_otp_requested', true)
            ->with('phone', $phone);
    }

    public function verifyResetOtp(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'otp'   => 'required|string|size:6',
        ]);

        $phone = $this->normalizePhone($request->phone);

        $otpRecord = OtpVerification::where('phone', $phone)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->orderBy('created_at', 'desc')
            ->first();

        if (! $otpRecord || ! Hash::check($request->otp, $otpRecord->code_hash)) {
            return back()->withErrors(['otp' => 'Invalid or expired code']);
        }

        $otpRecord->update(['used_at' => now()]);

        return back()
            ->with('reset_verified', true)
            ->with('phone', $phone);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'phone'                 => 'required|string',
            'password'              => 'required|string|min:6|confirmed',
            'password_confirmation' => 'required|string',
        ]);

        $phone    = $this->normalizePhone($request->phone);
        $customer = Customer::where('phone', $phone)->first();

        if (! $customer) {
            return back()->withErrors(['phone' => 'No account found for this phone number.']);
        }

        $customer->update(['password' => Hash::make($request->password)]);

        Auth::guard('customer')->login($customer);
        $request->session()->regenerate();

        $this->queueHandoffCookies($customer);

        return redirect('/order/menu')->with('message', 'Password reset successfully. Welcome back!');
    }

    // ── Step 2a: Verify OTP ───────────────────────────────────────────────────

    public function verifyOtp(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'otp'   => 'required|string|size:6',
        ]);

        $phone = $this->normalizePhone($request->phone);

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

        if (! $otpRecord || ! Hash::check($request->otp, $otpRecord->code_hash)) {
            return back()->withErrors(['otp' => 'Invalid or expired OTP']);
        }

        $otpRecord->update(['used_at' => now()]);

        $customer = Customer::firstOrCreate(
            ['phone' => $phone],
            ['loyalty_points' => 0, 'tier' => 'bronze'],
        );

        if (! $customer->wasRecentlyCreated && ! $customer->is_active) {
            return back()->withErrors(['otp' => 'This account has been deactivated. Please contact support.']);
        }

        $customer->update(['last_login_at' => now()]);

        // Use the customer guard so the session cookie works for both
        // the Blade site and the React order app.
        Auth::guard('customer')->login($customer);
        $request->session()->regenerate();

        // Redirect to profile setup if this is a first-time customer
        if (! $customer->is_profile_complete) {
            $this->queueHandoffCookies($customer);
            return redirect()->route('customer.complete-profile');
        }

        $this->queueHandoffCookies($customer);

        $intendedUrl = session('intended_url', '/');
        session()->forget('intended_url');
        if (! is_string($intendedUrl) || ! str_starts_with($intendedUrl, '/')) {
            $intendedUrl = '/';
        }

        return redirect($intendedUrl)->with('message', 'Logged in successfully!');
    }

    // ── Step 2b: Password login ───────────────────────────────────────────────

    public function passwordLogin(Request $request)
    {
        $request->validate([
            'phone'    => 'required|string',
            'password' => 'required|string',
        ]);

        $phone    = $this->normalizePhone($request->phone);
        $customer = Customer::where('phone', $phone)->first();

        if (! $customer || empty($customer->password) || ! Hash::check($request->password, $customer->password)) {
            return back()->withErrors(['password' => 'Invalid phone number or password.'])->withInput(['phone' => $request->phone]);
        }

        if (! $customer->is_active) {
            return back()->withErrors(['phone' => 'This account has been deactivated. Please contact support.'])->withInput(['phone' => $request->phone]);
        }

        $customer->update(['last_login_at' => now()]);

        Auth::guard('customer')->login($customer);
        $request->session()->regenerate();

        if (! $customer->is_profile_complete) {
            $this->queueHandoffCookies($customer);
            return redirect()->route('customer.complete-profile');
        }

        $this->queueHandoffCookies($customer);

        $intendedUrl = session('intended_url', '/');
        session()->forget('intended_url');
        if (! is_string($intendedUrl) || ! str_starts_with($intendedUrl, '/')) {
            $intendedUrl = '/';
        }

        return redirect($intendedUrl)->with('message', 'Logged in successfully!');
    }

    // ── Profile setup (first-time) ────────────────────────────────────────────

    public function showCompleteProfile()
    {
        if (! Auth::guard('customer')->check()) {
            return redirect()->route('customer.login');
        }

        return view('customer.complete-profile');
    }

    public function completeProfile(Request $request)
    {
        if (! Auth::guard('customer')->check()) {
            return redirect()->route('customer.login');
        }

        $request->validate([
            'name'                  => 'required|string|max:100',
            'email'                 => 'nullable|email|max:100',
            'password'              => 'required|string|min:6|confirmed',
            'password_confirmation' => 'required|string',
        ]);

        /** @var Customer $customer */
        $customer = Auth::guard('customer')->user();

        $customer->update([
            'name'                => $request->name,
            'email'               => $request->email,
            'password'            => Hash::make($request->password),
            'is_profile_complete' => true,
        ]);

        $this->queueHandoffCookies($customer);

        $intendedUrl = session('intended_url', '/');
        session()->forget('intended_url');
        if (! is_string($intendedUrl) || ! str_starts_with($intendedUrl, '/')) {
            $intendedUrl = '/';
        }

        return redirect($intendedUrl)->with('message', 'Welcome! Your account is all set.');
    }

    // ── Session sync (called by React order app after API login) ─────────────

    /**
     * Establish a Blade web session from a valid Sanctum Bearer token.
     * React calls this after every login so the main website header
     * immediately reflects the logged-in state.
     * Protected by auth:sanctum + customer.token; CSRF is waived.
     */
    public function syncSession(Request $request)
    {
        /** @var Customer $customer */
        $customer = $request->user();

        if (! $customer->is_active) {
            return response()->json(['message' => 'This account has been deactivated.'], 403);
        }

        Auth::guard('customer')->login($customer);
        $request->session()->regenerate();

        return response()->json(['ok' => true]);
    }

    // ── Logout ────────────────────────────────────────────────────────────────

    public function logout(Request $request)
    {
        /** @var Customer|null $customer */
        $customer = Auth::guard('customer')->user();
        if ($customer instanceof Customer) {
            $customer->tokens()->where('name', 'like', 'customer-%')->delete();
        }

        Auth::guard('customer')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        // Tell the React order app (same origin, JS-readable cookie) that
        // the session was invalidated so it can clear its localStorage token.
        $domain = config('session.domain');
        $secure = $request->isSecure();
        Cookie::queue('_cauth_revoked', '1', 10, '/', $domain, $secure, false, false, 'Lax');

        return redirect('/')->with('message', 'Logged out successfully');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Queue short-lived non-httponly cookies so the React order app can
     * detect the Blade login without touching the session cookie.
     * TTL: 24 hours — the React app consumes and deletes them on first mount.
     */
    private function queueHandoffCookies(Customer $customer): void
    {
        $customer->tokens()->where('name', 'like', 'customer-%')->delete();
        $token  = $customer->createToken('customer-' . $customer->phone, ['customer'])->plainTextToken;
        // Always show the short phone number (strip +960) so both apps show the same thing
        $name   = str_replace('+960', '', $customer->phone ?? '');
        $domain = config('session.domain'); // .bakeandgrill.mv
        $secure = request()->isSecure();

        // non-httponly so React JS can read with document.cookie
        Cookie::queue('_cauth',      $token, 1440, '/', $domain, $secure, false, false, 'Lax');
        Cookie::queue('_cauth_name', $name,  1440, '/', $domain, $secure, false, false, 'Lax');
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
