<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Events\CustomerCreated;
use App\Domains\Notifications\Services\SmsService;
use App\Http\Controllers\Controller;
use App\Mail\CustomerOtpMail;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OtpVerification;
use App\Rules\MaldivesPhone;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class CustomerAuthController extends Controller
{
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

    private function sendOtp(string $phone, string $purpose = 'login', string $channel = 'sms', ?string $email = null): string
    {
        $otpCode = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $channel = $channel === 'email' ? 'email' : 'sms';

        $otpRow = OtpVerification::create([
            'phone' => $phone,
            'channel' => $channel,
            'email' => $channel === 'email' ? $email : null,
            'code_hash' => Hash::make($otpCode),
            'expires_at' => now()->addMinutes(10),
            'attempts' => 0,
        ]);

        if ($channel === 'email') {
            Mail::to((string) $email)->send(new CustomerOtpMail($otpCode, 10));

            return $otpCode;
        }

        $smsService = app(SmsService::class);
        $smsMessage = "Your Bake & Grill verification code is {$otpCode}. Valid for 10 minutes. Do not share this code.";

        // Idempotency key must be unique per OTP row, otherwise back-to-back
        // requests in the same minute share a key and SmsService::send() drops
        // the SMS as a duplicate — the OtpVerification row stays in DB and the
        // customer fails verification on a code they never received.
        // Scoping to the OTP row id guarantees a fresh dispatch every time.
        $smsService->send(new SmsMessage(
            to: $phone,
            message: $smsMessage,
            type: 'otp',
            referenceType: 'otp',
            referenceId: (string) $otpRow->id,
            idempotencyKey: 'otp:' . $purpose . ':' . $phone . ':' . $otpRow->id,
        ));

        return $otpCode;
    }

    private function verifyAndConsumeOtp(string $phone, string $code): void
    {
        // Order by `id` (auto-increment, monotonic) rather than `created_at`
        // (second-precision timestamp) so two requests within the same wall-
        // clock second still resolve to a deterministic newest row. Without
        // this, the SQL planner may return either row first → customer types
        // the latest code they were sent and is verified against the older
        // hash → spurious "Invalid OTP code" errors.
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

        // Controller-level rate limit (in addition to route throttle) so lockout
        // message is friendly and consistent regardless of proxy/throttle config.
        $rateKey = 'customer-login:' . $phone . ':' . $request->ip();

        if (RateLimiter::tooManyAttempts($rateKey, 5)) {
            $seconds = RateLimiter::availableIn($rateKey);
            throw ValidationException::withMessages([
                'phone' => ['Too many login attempts. Try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        $customer = Customer::where('phone', $phone)->first();

        if (!$customer || empty($customer->password) || !Hash::check($input['password'], $customer->password)) {
            RateLimiter::hit($rateKey, 900); // 15-minute decay per phone+IP
            throw ValidationException::withMessages([
                'phone' => ['Invalid phone number or password.'],
            ]);
        }

        RateLimiter::clear($rateKey);

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

        $otpCode = $this->sendOtp($phone, $purpose, $channel, $email);

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
        if (app()->environment(['local', 'testing']) && filter_var(env('OTP_DEV_RETURN'), FILTER_VALIDATE_BOOLEAN)) {
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

        $otpCode = $this->sendOtp($phone, 'reset_password');

        // Audit trail without the code itself — see requestOtp() for the
        // rationale on intentionally NOT logging the plaintext code.
        logger()->info('Password reset OTP requested', ['phone' => $phone]);

        $response = [
            'message' => 'Password reset code sent',
            'expires_in' => 600,
        ];

        if (app()->environment(['local', 'testing']) && filter_var(env('OTP_DEV_RETURN'), FILTER_VALIDATE_BOOLEAN)) {
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
     * Finds or creates a customer and issues a Sanctum token for one checkout session.
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
        if ($existing && $existing->trashed()) {
            $existing->restoreForReregistration();
            $existing->update(['name' => $input['name']]);
            $customer = $existing;
        } elseif ($existing) {
            if (!$existing->is_active) {
                throw ValidationException::withMessages([
                    'phone' => ['This account has been deactivated. Please contact support.'],
                ]);
            }
            $customer = $existing;
            if (!$customer->name && $input['name']) {
                $customer->update(['name' => $input['name']]);
            }
        } else {
            $customer = Customer::create([
                'phone' => $phone,
                'name' => $input['name'],
                'loyalty_points' => 0,
                'tier' => 'bronze',
            ]);
        }

        $customer->update(['last_login_at' => now()]);
        $this->establishCustomerSession($request, $customer);

        return response()->json([
            ...$this->authenticatedPayload('Guest session started', $customer),
            'is_new_customer' => $customer->wasRecentlyCreated,
        ]);
    }
}
