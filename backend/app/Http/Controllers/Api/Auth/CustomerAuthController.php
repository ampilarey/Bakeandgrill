<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Domains\Auth\Services\CustomerOtpService;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Rules\MaldivesPhone;
use App\Support\CustomerLoginThrottle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class CustomerAuthController extends Controller
{
    public function __construct(
        private readonly CustomerOtpService $otpService,
    ) {}

    // ── Shared helpers ────────────────────────────────────────────────────────

    private function normalizePhone(string $phone): string
    {
        return MaldivesPhone::normalize($phone);
    }

    private function customerResponse(Customer $customer): array
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

    private function establishCustomerSession(Request $request, Customer $customer): void
    {
        Auth::guard('customer')->login($customer);
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }
    }

    /**
     * @return array{message: string, customer: array<string, mixed>}
     */
    private function authenticatedPayload(string $message, Customer $customer): array
    {
        return [
            'message' => $message,
            'customer' => $this->customerResponse($customer),
        ];
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

        // Shared with Blade web login (CustomerLoginThrottle).
        if (CustomerLoginThrottle::tooManyAttempts($phone, (string) $request->ip())) {
            $seconds = CustomerLoginThrottle::availableInSeconds($phone, (string) $request->ip());
            throw ValidationException::withMessages([
                'phone' => ['Too many login attempts. Try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        $customer = Customer::where('phone', $phone)->first();

        if (!$customer || empty($customer->password) || !Hash::check($input['password'], $customer->password)) {
            CustomerLoginThrottle::hit($phone, (string) $request->ip());
            throw ValidationException::withMessages([
                'phone' => ['Invalid phone number or password.'],
            ]);
        }

        CustomerLoginThrottle::clear($phone, (string) $request->ip());

        if (!$customer->is_active) {
            throw ValidationException::withMessages([
                'phone' => ['This account has been deactivated. Please contact support.'],
            ]);
        }

        $customer->update(['last_login_at' => now()]);
        $this->establishCustomerSession($request, $customer);

        return response()->json($this->authenticatedPayload('Login successful', $customer));
    }

    /**
     * Request OTP — for new customers or password reset.
     */
    public function requestOtp(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
            'purpose' => 'nullable|string|in:register,reset_password',
            'channel' => 'nullable|string|in:sms,email',
            'email' => 'nullable|email|max:190',
        ]);

        $phone = $this->normalizePhone($request->phone);
        $purpose = $request->input('purpose', 'register');
        $channel = $request->input('channel', 'sms') === 'email' ? 'email' : 'sms';
        $email = $request->filled('email') ? trim((string) $request->input('email')) : null;

        if ($channel === 'email' && ($email === null || $email === '')) {
            throw ValidationException::withMessages([
                'email' => ['An email address is required when requesting an email OTP.'],
            ]);
        }

        // SECURITY: an email OTP may only be sent to the email already stored
        // on THIS phone's customer account (matching account email — there is
        // no email_verified_at ownership proof). Otherwise anyone knowing a
        // phone number could deliver the OTP to their own inbox and take over
        // the account (2026-08 audit #1). Accounts with no email on file must
        // use SMS.
        if ($channel === 'email') {
            $emailOwner = Customer::where('phone', $phone)->first();
            $storedEmail = $emailOwner?->email ? strtolower(trim($emailOwner->email)) : null;
            if ($storedEmail === null || $storedEmail !== strtolower((string) $email)) {
                throw ValidationException::withMessages([
                    'email' => ['We can only email a code to the address already on this account. Please use SMS instead.'],
                ]);
            }
        }

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

        $key = 'otp-request:login:' . $phone;

        if (RateLimiter::tooManyAttempts($key, 20)) {
            $seconds = RateLimiter::availableIn($key);
            throw ValidationException::withMessages([
                'phone' => ['Too many OTP requests. Please try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        RateLimiter::hit($key, 300);

        $otpCode = $this->otpService->issue($phone, $purpose, $channel, $email);

        // Audit trail without leaking the code. The actual code only ever lives
        // hashed in `otp_verifications.code_hash` and (briefly) in the SMS/email body.
        logger()->info('OTP requested', ['phone' => $phone, 'purpose' => $purpose, 'channel' => $channel]);

        $response = [
            'message' => $channel === 'email' ? 'OTP sent to email' : 'OTP sent successfully',
            'expires_in' => 600,
            'channel' => $channel,
        ];

        // Dev convenience only — never in production, never just on APP_DEBUG.
        // Requires an explicit OTP_DEV_RETURN=true to surface the code to the
        // client so staging logs and screenshots can't accidentally leak it.
        if (app()->environment(['local', 'testing']) && (bool) config('system.otp_dev_return')) {
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

        // Only login/registration OTPs may authenticate — a reset OTP must not.
        $this->otpService->verifyAndConsume($phone, $input['otp'], CustomerOtpService::LOGIN_PURPOSES);

        // Successful verification — clear OTP request rate limit so user can request again cleanly
        RateLimiter::clear('otp-request:login:' . $phone);

        // Include soft-deleted rows so we don't hit a unique constraint violation
        // when a customer who was admin-deleted tries to log back in via OTP.
        $existing = Customer::withTrashed()->where('phone', $phone)->first();

        $restoredFromTrash = false;
        if ($existing && $existing->trashed()) {
            // Restore the soft-deleted account — OTP proves ownership of the phone.
            // Clear old profile so they re-enter name/password like a new signup.
            $existing->restoreForReregistration();
            $customer = $existing;
            $restoredFromTrash = true;
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

        $isNew = $customer->wasRecentlyCreated || $restoredFromTrash;

        // Note: CustomerCreated event is intentionally NOT fired here.
        // OTP registrations are silent/quick-checkout flows — the customer has no name yet
        // and sending a staff SMS for every OTP signup creates noise.
        // Fire CustomerCreated only from password-based registration flows where a complete
        // profile (name + password) is submitted.

        $customer->update(['last_login_at' => now()]);
        $this->establishCustomerSession($request, $customer);

        return response()->json([
            ...$this->authenticatedPayload('Verified successfully', $customer),
            'is_new_customer' => $isNew,
        ]);
    }

    /**
     * Check if the customer is already authenticated via session cookie.
     * Called by the React app on mount to auto-login customers who logged in on the Blade site.
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

        return response()->json([
            'authenticated' => true,
            'customer' => $this->customerResponse($customer),
        ]);
    }

    /**
     * End the customer session (and revoke Bearer token when present).
     */
    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user instanceof Customer && $request->bearerToken()) {
            $user->currentAccessToken()?->delete();
        }

        Auth::guard('customer')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        // Signal other /order tabs (and keep parity with Blade logout).
        $domain = config('session.domain');
        $secure = $request->isSecure();
        Cookie::queue('_cauth_revoked', '1', 10, '/', $domain, $secure, false, false, 'Lax');

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

        $key = 'otp-request:reset:' . $phone;

        if (RateLimiter::tooManyAttempts($key, 5)) {
            $seconds = RateLimiter::availableIn($key);
            throw ValidationException::withMessages([
                'phone' => ['Too many requests. Please try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        RateLimiter::hit($key, 1800);

        $otpCode = $this->otpService->issue($phone, 'reset_password');

        // Audit trail without the code itself — see requestOtp() for the
        // rationale on intentionally NOT logging the plaintext code.
        logger()->info('Password reset OTP requested', ['phone' => $phone]);

        $response = [
            'message' => 'Password reset code sent',
            'expires_in' => 600,
        ];

        if (app()->environment(['local', 'testing']) && (bool) config('system.otp_dev_return')) {
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

        // Only reset-purpose OTPs may reset a password.
        $this->otpService->verifyAndConsume($phone, $input['otp'], CustomerOtpService::RESET_PURPOSES);

        $customer = Customer::where('phone', $phone)->first();

        if (!$customer) {
            throw ValidationException::withMessages([
                'phone' => ['No account found for this phone number.'],
            ]);
        }

        // Direct attribute assignment — 'password' is excluded from $fillable.
        // The 'hashed' cast handles bcrypt; do NOT pass Hash::make() here or it double-hashes.
        $customer->password = $input['password'];
        $customer->last_login_at = now();
        $customer->save();

        // Password reset: revoke legacy bearer tokens, then establish a fresh session.
        $customer->tokens()->where('name', 'like', 'customer-%')->delete();
        $this->establishCustomerSession($request, $customer);

        return response()->json($this->authenticatedPayload('Password reset successfully', $customer));
    }

    /**
     * Guest checkout — name + phone only, no OTP.
     *
     * SECURITY: only ever creates a brand-new customer. If the phone already
     * belongs to any customer record (active or soft-deleted), the caller must
     * prove ownership via OTP or password login — otherwise anyone who knows a
     * phone number could take over that account's session, order history, and
     * saved addresses.
     */
    public function guestSession(Request $request)
    {
        $input = $request->validate([
            'phone' => ['required', 'string', new MaldivesPhone],
            'name' => 'required|string|max:100',
        ]);

        $phone = $this->normalizePhone($input['phone']);
        $rateKey = 'guest-checkout:' . $phone . ':' . ($request->ip() ?? 'unknown');

        if (RateLimiter::tooManyAttempts($rateKey, 10)) {
            throw ValidationException::withMessages([
                'phone' => ['Too many guest checkout attempts. Please try again later or sign in with OTP.'],
            ]);
        }
        RateLimiter::hit($rateKey, 3600);

        $existing = Customer::withTrashed()->where('phone', $phone)->first();
        if ($existing) {
            throw ValidationException::withMessages([
                'phone' => ['This number already has an account. Please verify with a one-time code or log in with your password.'],
            ]);
        }

        $customer = Customer::create([
            'phone' => $phone,
            'name' => $input['name'],
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);

        $customer->update(['last_login_at' => now()]);
        $this->establishCustomerSession($request, $customer);

        return response()->json([
            ...$this->authenticatedPayload('Guest session started', $customer),
            'is_new_customer' => $customer->wasRecentlyCreated,
        ]);
    }
}
