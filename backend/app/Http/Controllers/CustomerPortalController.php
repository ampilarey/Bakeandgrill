<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Auth\Services\CustomerOtpService;
use App\Domains\Auth\Services\PasswordResetGrantService;
use App\Models\Customer;
use App\Models\Order;
use App\Rules\MaldivesPhone;
use App\Support\CustomerLoginThrottle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class CustomerPortalController extends Controller
{
    public function __construct(
        private readonly CustomerOtpService $otpService,
        private readonly PasswordResetGrantService $resetGrantService,
    ) {}

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
        $request->validate(['phone' => ['required', 'string', new MaldivesPhone]]);

        $phone = $this->normalizePhone($request->phone);

        // Returning customer with a password → show password form (no SMS cost)
        $customer = Customer::where('phone', $phone)->first();
        if ($customer && !empty($customer->password)) {
            return back()
                ->with('password_step', true)
                ->with('phone', $phone);
        }

        // New customer or no password → send OTP
        $key = 'otp-request:web:' . $phone;

        if (RateLimiter::tooManyAttempts($key, 10)) {
            $seconds = RateLimiter::availableIn($key);

            return back()->withErrors(['phone' => 'Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.']);
        }

        RateLimiter::hit($key, 600);

        $otpCode = $this->otpService->issue($phone, 'web-login');

        if (!app()->environment('production')) {
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
        $request->validate(['phone' => ['required', 'string', new MaldivesPhone]]);

        $phone = $this->normalizePhone($request->phone);

        $key = 'otp-request:web-reset:' . $phone;

        if (RateLimiter::tooManyAttempts($key, 5)) {
            $seconds = RateLimiter::availableIn($key);

            return back()->withErrors(['phone' => 'Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.']);
        }

        RateLimiter::hit($key, 600);

        $otpCode = $this->otpService->issue($phone, 'web-reset');

        if (!app()->environment('production')) {
            session()->flash('otp_hint', "Dev mode – SMS not sent. OTP: {$otpCode}");
        }

        return back()
            ->with('reset_otp_requested', true)
            ->with('phone', $phone);
    }

    public function verifyResetOtp(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
            'otp' => 'required|string|size:6',
        ]);

        $phone = $this->normalizePhone($request->phone);

        try {
            $this->otpService->verifyAndConsume($phone, $request->otp, CustomerOtpService::RESET_PURPOSES);
        } catch (ValidationException $e) {
            return back()
                ->with('reset_otp_requested', true)
                ->with('phone', $phone)
                ->withErrors($e->errors());
        }

        $grant = $this->resetGrantService->issue($phone);
        $request->session()->put('password_reset_grant', $grant);
        $request->session()->put('password_reset_phone', $phone);

        return back()
            ->with('reset_verified', true)
            ->with('phone', $phone);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
            'password' => 'required|string|min:6|confirmed',
            'password_confirmation' => 'required|string',
        ]);

        $phone = $this->normalizePhone($request->phone);
        $grantToken = $request->session()->get('password_reset_grant');
        $grantedPhone = $request->session()->get('password_reset_phone');

        // Session must carry both the grant token and the verified phone — never
        // trust the submitted phone alone. Cache consume enforces single-use + TTL.
        if (
            !is_string($grantToken)
            || !is_string($grantedPhone)
            || $grantedPhone !== $phone
            || !$this->resetGrantService->consume($grantToken, $phone)
        ) {
            $request->session()->forget(['password_reset_grant', 'password_reset_phone']);

            return back()->withErrors([
                'password' => 'Your reset session has expired. Please request a new code.',
            ]);
        }

        $request->session()->forget(['password_reset_grant', 'password_reset_phone']);

        $customer = Customer::where('phone', $phone)->first();

        if (!$customer) {
            return back()->withErrors(['phone' => 'No account found for this phone number.']);
        }

        if (!$customer->is_active) {
            return back()->withErrors([
                'phone' => 'This account has been deactivated. Please contact support.',
            ]);
        }

        // 'password' is excluded from $fillable — set directly so the hashed cast
        // encrypts once. Mass-assigning throws under preventSilentlyDiscardingAttributes.
        $customer->password = $request->password;
        $customer->save();

        // Match API reset: revoke existing Sanctum bearer tokens after password change.
        $customer->tokens()->where('name', 'like', 'customer-%')->delete();

        Auth::guard('customer')->login($customer);
        $request->session()->regenerate();

        return redirect('/order/menu')->with('message', 'Password reset successfully. Welcome back!');
    }

    /**
     * GET /customer/verify-otp — form posts here; refresh after a failed POST
     * would otherwise 405. Send guests back to login; send authed customers on.
     */
    public function showVerifyOtp()
    {
        if (Auth::guard('customer')->check()) {
            $customer = Auth::guard('customer')->user();
            if ($customer instanceof Customer && !$customer->is_profile_complete) {
                return redirect()->route('customer.complete-profile');
            }

            return redirect('/order/menu');
        }

        return redirect()->route('customer.login');
    }

    // ── Step 2a: Verify OTP ───────────────────────────────────────────────────

    public function verifyOtp(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
            'otp' => 'required|string|size:6',
        ]);

        $phone = $this->normalizePhone($request->phone);

        $verifyKey = 'otp-web-verify:' . $phone;
        $limited = $this->otpRateLimited($verifyKey, 5);
        if ($limited !== null) {
            return back()->withErrors([
                'otp' => 'Too many attempts. Try again in ' . ceil($limited / 60) . ' minutes.',
            ]);
        }

        try {
            $this->otpService->verifyAndConsume($phone, $request->otp, CustomerOtpService::LOGIN_PURPOSES);
        } catch (ValidationException $e) {
            return back()->withErrors($e->errors());
        }

        // Successful verification — clear the OTP request rate limit for this phone
        $this->clearOtpRateLimit('otp-request:web:' . $phone);

        // Match API: include soft-deleted rows so we don't hit a unique constraint
        // when a customer who was admin-deleted tries to log back in via OTP.
        $customer = $this->findOrRestoreCustomerByPhone($phone);
        if ($customer === null) {
            return back()->withErrors(['otp' => 'This account has been deactivated. Please contact support.']);
        }

        $customer->update(['last_login_at' => now()]);

        // Use the customer guard so the session cookie works for both
        // the Blade site and the React order app.
        Auth::guard('customer')->login($customer);
        $request->session()->regenerate();

        // Redirect to profile setup if this is a first-time customer
        if (!$customer->is_profile_complete) {
            return redirect()->route('customer.complete-profile');
        }

        $intendedUrl = session('intended_url', '/');
        session()->forget('intended_url');
        if (!is_string($intendedUrl) || !str_starts_with($intendedUrl, '/')) {
            $intendedUrl = '/';
        }

        return redirect($intendedUrl)->with('message', 'Logged in successfully!');
    }

    // ── Step 2b: Password login ───────────────────────────────────────────────

    public function passwordLogin(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
            'password' => 'required|string',
        ]);

        $phone = $this->normalizePhone($request->phone);
        $ip = (string) $request->ip();

        // Same phone+IP / account limits as API password login.
        if (CustomerLoginThrottle::tooManyAttempts($phone, $ip)) {
            $seconds = CustomerLoginThrottle::availableInSeconds($phone, $ip);

            return back()->withErrors([
                'phone' => 'Too many login attempts. Try again in ' . ceil($seconds / 60) . ' minutes.',
            ])->withInput(['phone' => $request->phone]);
        }

        $customer = Customer::where('phone', $phone)->first();

        if (!$customer || empty($customer->password) || !Hash::check($request->password, $customer->password)) {
            CustomerLoginThrottle::hit($phone, $ip);

            // Same generic message as API — do not reveal whether the phone exists.
            return back()->withErrors([
                'password' => 'Invalid phone number or password.',
            ])->withInput(['phone' => $request->phone]);
        }

        CustomerLoginThrottle::clear($phone, $ip);

        if (!$customer->is_active) {
            return back()->withErrors([
                'phone' => 'This account has been deactivated. Please contact support.',
            ])->withInput(['phone' => $request->phone]);
        }

        $customer->update(['last_login_at' => now()]);

        Auth::guard('customer')->login($customer);
        $request->session()->regenerate();

        if (!$customer->is_profile_complete) {
            return redirect()->route('customer.complete-profile');
        }

        $intendedUrl = session('intended_url', '/');
        session()->forget('intended_url');
        if (!is_string($intendedUrl) || !str_starts_with($intendedUrl, '/')) {
            $intendedUrl = '/';
        }

        return redirect($intendedUrl)->with('message', 'Logged in successfully!');
    }

    // ── Profile setup (first-time) ────────────────────────────────────────────

    public function showCompleteProfile()
    {
        if (!Auth::guard('customer')->check()) {
            return redirect()->route('customer.login');
        }

        return view('customer.complete-profile');
    }

    public function completeProfile(Request $request)
    {
        if (!Auth::guard('customer')->check()) {
            return redirect()->route('customer.login');
        }

        $input = $request->validate([
            'name' => 'required|string|max:100',
            'email' => 'nullable|email|max:100',
            'password' => 'required|string|min:6|confirmed',
            'password_confirmation' => 'required|string',
        ]);

        /** @var Customer $customer */
        $customer = Auth::guard('customer')->user();

        // 'password' is excluded from $fillable — must be set directly so the
        // 'hashed' cast encrypts it. Mass-assigning it throws under
        // Model::preventSilentlyDiscardingAttributes() (APP_ENV=local/test).
        $customer->name = $input['name'];
        $customer->email = $input['email'] ?? $customer->email;
        $customer->password = $input['password'];
        $customer->is_profile_complete = true;
        $customer->save();

        $intendedUrl = session('intended_url', '/');
        session()->forget('intended_url');
        if (!is_string($intendedUrl) || !str_starts_with($intendedUrl, '/')) {
            $intendedUrl = '/';
        }

        return redirect($intendedUrl)->with('message', 'Welcome! Your account is all set.');
    }

    // ── Session sync (legacy Bearer bridge) ──────────────────────────────────

    /**
     * Establish a Blade web session from a valid Sanctum Bearer token.
     * The /order SPA now uses the shared session cookie directly (no Bearer),
     * so this is only needed for older token-based clients.
     * Protected by auth:sanctum + customer.token; CSRF is waived.
     */
    public function syncSession(Request $request)
    {
        /** @var Customer $customer */
        $customer = $request->user();

        if (!$customer->is_active) {
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

        // Tell open /order SPA tabs (same origin, JS-readable) to re-probe
        // auth — the session cookie itself is already invalidated above.
        $domain = config('session.domain');
        $secure = $request->isSecure();
        Cookie::queue('_cauth_revoked', '1', 10, '/', $domain, $secure, false, false, 'Lax');

        return redirect('/')->with('message', 'Logged out successfully');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function normalizePhone(string $phone): string
    {
        return MaldivesPhone::normalize($phone);
    }

    /**
     * Find by phone, restore soft-deleted accounts, or create a new customer.
     * Returns null when an existing non-deleted account is deactivated.
     */
    private function findOrRestoreCustomerByPhone(string $phone): ?Customer
    {
        $existing = Customer::withTrashed()->where('phone', $phone)->first();

        if ($existing && $existing->trashed()) {
            $existing->restoreForReregistration();

            return $existing;
        }

        if ($existing) {
            return $existing->is_active ? $existing : null;
        }

        return Customer::create([
            'phone' => $phone,
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);
    }

    /**
     * Hit the OTP verify rate limiter. Returns seconds until available when
     * limited, or null when allowed. Redis blips must not 500 the login flow.
     */
    private function otpRateLimited(string $key, int $maxAttempts): ?int
    {
        try {
            if (RateLimiter::tooManyAttempts($key, $maxAttempts)) {
                return RateLimiter::availableIn($key);
            }
            RateLimiter::hit($key, 600);
        } catch (\Throwable $e) {
            report($e);
        }

        return null;
    }

    private function clearOtpRateLimit(string $key): void
    {
        try {
            RateLimiter::clear($key);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
