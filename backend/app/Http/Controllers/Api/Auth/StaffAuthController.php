<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\StaffAuthRateLimit;
use App\Services\StaffUserLookup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\TransientToken;

class StaffAuthController extends Controller
{
    public function __construct(private readonly AuditLogService $audit) {}

    /**
     * Record a rejected sign-in, then fail with a message that says nothing
     * about whether the account exists.
     *
     * Every failure path goes through here for two reasons. Nothing was
     * audited before, so "did someone try the admin panel last night" had no
     * answer. And the messages used to differ: a real account with no PIN was
     * told "No PIN is set on this account", which confirmed the account to
     * anyone typing in phone numbers. The owner can already see who has a PIN
     * in Admin -> Staff, which is where that hint belongs.
     */
    private function rejectSignIn(
        Request $request,
        string $field,
        string $message,
        string $reason,
        string $identityKey,
        ?User $user = null,
    ): never {
        $this->audit->log(
            action: 'auth.staff_login_failed',
            modelType: User::class,
            modelId: $user?->id,
            oldValues: [],
            newValues: [],
            meta: [
                'reason' => $reason,
                // Needed to answer "which account was being tried"; the audit
                // log already records the IP alongside it.
                'identity' => $identityKey,
                'surface' => $field === 'pin' ? 'pos_pin' : ($field === 'phone' ? 'admin' : 'pos_password'),
            ],
            request: $request,
        );

        throw ValidationException::withMessages([$field => [$message]]);
    }

    /** A tripped limiter is the signal worth alerting on, so it is its own action. */
    private function rejectLockedOut(
        Request $request,
        string $field,
        int $seconds,
        string $identityKey,
    ): never {
        $this->audit->log(
            action: 'auth.staff_login_locked',
            modelType: User::class,
            modelId: null,
            oldValues: [],
            newValues: [],
            meta: ['identity' => $identityKey, 'locked_for_seconds' => $seconds],
            request: $request,
        );

        throw ValidationException::withMessages([
            $field => ['Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.'],
        ]);
    }

    /**
     * PIN login for staff users.
     * Requires both email/username and PIN so the candidate is identified first,
     * then exactly one Hash::check is performed — O(1) regardless of staff count.
     */
    public function pinLogin(Request $request): JsonResponse
    {
        $request->validate([
            'username' => 'required|string|max:255',
            'pin' => 'required|string|min:4|max:8',
            'device_identifier' => 'nullable|string',
            'intent' => 'nullable|string|in:pos,admin',
        ]);

        $pin = $request->pin;
        $this->clearLegacyMiskeyedPhoneLocks($request->username, (string) $request->ip());
        $identityKey = StaffUserLookup::canonicalIdentityKey($request->username);
        $forAdmin = $request->input('intent') === 'admin';

        $rateKey = StaffAuthRateLimit::pinIp($identityKey, (string) $request->ip());
        // Per-identity counter (independent of IP) so credential-stuffing
        // from a rotating IP pool still trips an account lockout.
        $acctKey = StaffAuthRateLimit::pinAccount($identityKey);
        if (
            RateLimiter::tooManyAttempts($rateKey, 8)
            || RateLimiter::tooManyAttempts($acctKey, 20)
        ) {
            $seconds = max(
                RateLimiter::availableIn($rateKey),
                RateLimiter::availableIn($acctKey),
            );
            $this->rejectLockedOut($request, 'pin', $seconds, $identityKey);
        }

        $user = $this->findActiveStaffByUsername($request->username);

        if (!$user) {
            RateLimiter::hit($rateKey, 600);
            RateLimiter::hit($acctKey, 600);
            $this->rejectSignIn($request, 'pin', 'Invalid mobile/email or PIN.', 'unknown_identity', $identityKey);
        }

        if ($user->pin_hash === null) {
            RateLimiter::hit($rateKey, 600);
            RateLimiter::hit($acctKey, 600);
            // Same wording as a wrong PIN: saying "no PIN is set" confirms the
            // account exists to anyone working through phone numbers.
            $this->rejectSignIn($request, 'pin', 'Invalid mobile/email or PIN.', 'no_pin_set', $identityKey, $user);
        }

        if (!Hash::check($pin, $user->pin_hash)) {
            RateLimiter::hit($rateKey, 600);
            RateLimiter::hit($acctKey, 600);
            $this->rejectSignIn($request, 'pin', 'Invalid mobile/email or PIN.', 'wrong_pin', $identityKey, $user);
        }

        RateLimiter::clear($rateKey);
        RateLimiter::clear($acctKey);

        if ($forAdmin) {
            return $this->issueAdminStaffSession($request, $user, 'pin');
        }

        return $this->issuePosStaffToken($user, 'pin', $request->input('device_identifier'));
    }

    /**
     * Password login for owner/manager accounts on POS (same password as admin panel).
     */
    public function posPasswordLogin(Request $request): JsonResponse
    {
        $request->validate([
            'username' => 'required|string|max:255',
            'password' => 'required|string|min:6',
            'device_identifier' => 'nullable|string',
        ]);

        $this->clearLegacyMiskeyedPhoneLocks($request->username, (string) $request->ip());
        $identityKey = StaffUserLookup::canonicalIdentityKey($request->username);
        $rateKey = StaffAuthRateLimit::posPasswordIp($identityKey, (string) $request->ip());

        if (RateLimiter::tooManyAttempts($rateKey, 8)) {
            $this->rejectLockedOut($request, 'password', RateLimiter::availableIn($rateKey), $identityKey);
        }

        $user = $this->findActiveStaffByUsername($request->username);

        if (!$user || !$this->verifyStaffPassword($user, $request->password)) {
            RateLimiter::hit($rateKey, 600);
            $this->rejectSignIn(
                $request,
                'password',
                'Invalid mobile/email or password.',
                $user ? 'wrong_password' : 'unknown_identity',
                $identityKey,
                $user,
            );
        }

        RateLimiter::clear($rateKey);

        return $this->issuePosStaffToken($user, 'password', $request->input('device_identifier'));
    }

    /**
     * Phone + password login for admin dashboard.
     */
    public function phoneLogin(Request $request): JsonResponse
    {
        $request->validate([
            'phone' => 'required|string|max:255',
            'password' => 'required|string|min:6',
        ]);

        $login = trim($request->phone);
        $this->clearLegacyMiskeyedPhoneLocks($login, (string) $request->ip());
        $identityKey = StaffUserLookup::canonicalIdentityKey($login);
        $rateKey = StaffAuthRateLimit::phoneLoginIp($identityKey, (string) $request->ip());

        if (RateLimiter::tooManyAttempts($rateKey, 8)) {
            $this->rejectLockedOut($request, 'phone', RateLimiter::availableIn($rateKey), $identityKey);
        }

        $user = $this->findActiveStaffByUsername($login);

        if (!$user) {
            RateLimiter::hit($rateKey, 600);
            $this->rejectSignIn($request, 'phone', 'Invalid mobile/email or password.', 'unknown_identity', $identityKey);
        }

        if (!$this->staffHasAdminPassword($user)) {
            RateLimiter::hit($rateKey, 600);
            // Same wording again — "no admin password is set" confirmed the
            // account to anyone guessing at the admin login.
            $this->rejectSignIn($request, 'phone', 'Invalid mobile/email or password.', 'no_admin_password', $identityKey, $user);
        }

        if (!$this->verifyStaffPassword($user, $request->password)) {
            RateLimiter::hit($rateKey, 600);
            $this->rejectSignIn($request, 'phone', 'Invalid mobile/email or password.', 'wrong_password', $identityKey, $user);
        }

        RateLimiter::clear($rateKey);

        return $this->issueAdminStaffSession($request, $user, 'phone');
    }

    /**
     * Request a password-reset OTP — sends SMS to the registered phone.
     */
    public function passwordResetRequest(Request $request)
    {
        $request->validate(['phone' => 'required|string|max:255']);

        $login = trim($request->phone);
        $identityKey = StaffUserLookup::canonicalIdentityKey($login);
        $rateKey = StaffAuthRateLimit::passwordResetRequest($identityKey);

        if (RateLimiter::tooManyAttempts($rateKey, 3)) {
            return response()->json(['message' => 'Too many OTP requests. Please wait a few minutes.'], 429);
        }

        $user = $this->findActiveStaffByUsername($login);
        $smsPhone = $user?->phone;

        if ($user && $smsPhone) {
            $otp = (string) random_int(100000, 999999);
            $cacheKey = $this->passwordResetOtpCacheKey($identityKey);
            Cache::put($cacheKey, Hash::make($otp), now()->addMinutes(10));
            Cache::forget($this->passwordResetOtpAttemptKey($identityKey));

            $fallback = "Your Bake & Grill admin password reset code is: {$otp}. Valid for 10 minutes.";
            $message = app(CustomerSmsMessageBuilder::class)->build(
                'auth_staff_password_reset',
                ['code' => $otp, 'minutes' => '10', 'brand' => 'Bake & Grill'],
                $fallback,
            );

            app(SmsService::class)->send(new SmsMessage(
                to: $smsPhone,
                message: $message,
                type: 'auth_staff_password_reset',
            ));

            RateLimiter::hit($rateKey, 300);
        }

        return response()->json(['message' => 'If this number is registered, an OTP has been sent.']);
    }

    /**
     * Verify OTP and set a new password.
     */
    public function passwordResetVerify(Request $request)
    {
        $request->validate([
            'phone' => 'required|string|max:255',
            'otp' => 'required|string|size:6',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $login = trim($request->phone);
        $identityKey = StaffUserLookup::canonicalIdentityKey($login);
        $cacheKey = $this->passwordResetOtpCacheKey($identityKey);
        $attemptKey = $this->passwordResetOtpAttemptKey($identityKey);
        $stored = Cache::get($cacheKey);

        if (!$stored || !Hash::check($request->otp, $stored)) {
            $attempts = (int) Cache::get($attemptKey, 0) + 1;
            Cache::put($attemptKey, $attempts, now()->addMinutes(10));

            if ($attempts >= 5) {
                Cache::forget($cacheKey);
                Cache::forget($attemptKey);
            }

            throw ValidationException::withMessages([
                'otp' => ['Invalid or expired OTP.'],
            ]);
        }

        $user = $this->findActiveStaffByUsername($login);

        if (!$user) {
            throw ValidationException::withMessages([
                'phone' => ['Account not found.'],
            ]);
        }

        $user->update(['password' => $request->password]);
        Cache::forget($cacheKey);
        Cache::forget($attemptKey);

        $user->tokens()->where('name', 'like', 'staff-%')->delete();

        return response()->json(['message' => 'Password updated. Please log in with your new password.']);
    }

    /**
     * Logout — revoke Bearer PAT (if any) and clear the web session (admin SPA).
     */
    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user instanceof User) {
            $token = $user->currentAccessToken();
            if ($token && !($token instanceof TransientToken)) {
                $token->delete();
            }
        }

        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'message' => 'Logged out',
        ]);
    }

    /**
     * Returns the granted permission slugs for a user (all for owner, else filtered).
     *
     * @return list<string>
     */
    private function resolvePermissionSlugs(User $user): array
    {
        return app(\App\Services\PermissionService::class)->grantedSlugs($user);
    }

    /**
     * Get current staff user.
     */
    /**
     * Revoke every token this account holds, on every device.
     *
     * logout() drops only the token in hand, so a till left signed in — or a
     * lost phone — stayed valid until its 72h TTL ran out, with no way to cut
     * it short. This is the button for that.
     */
    public function logoutEverywhere(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $revoked = $user->tokens()->count();
        $user->tokens()->delete();

        $this->audit->log(
            action: 'auth.staff_tokens_revoked',
            modelType: User::class,
            modelId: $user->id,
            oldValues: [],
            newValues: [],
            meta: ['revoked' => $revoked],
            request: $request,
        );

        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['message' => 'Signed out on all devices', 'revoked' => $revoked]);
    }

    public function me(Request $request)
    {
        if ($denied = $this->denyUnlessStaffActor($request)) {
            return $denied;
        }

        $user = $request->user();
        $user->loadMissing('role');

        return response()->json([
            'user' => $this->serializeStaffUser($user),
        ]);
    }

    /**
     * Update the authenticated staff member's personal preferences.
     */
    public function updatePreferences(Request $request)
    {
        if ($denied = $this->denyUnlessStaffActor($request)) {
            return $denied;
        }

        $validated = $request->validate([
            'pos_idle_lock_minutes' => 'required|integer|min:0|max:60',
        ]);

        $user = $request->user();
        $user->update([
            'pos_idle_lock_minutes' => $validated['pos_idle_lock_minutes'],
        ]);
        $user->loadMissing('role');

        return response()->json([
            'message' => 'Preferences saved',
            'user' => $this->serializeStaffUser($user),
        ]);
    }

    /**
     * Bearer PATs must carry the staff ability; web-session admin SPA users do not.
     */
    private function denyUnlessStaffActor(Request $request): ?JsonResponse
    {
        $user = $request->user();
        if (!$user instanceof User) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        if ($request->bearerToken() && !$user->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        return null;
    }

    private function passwordResetOtpCacheKey(string $identityKey): string
    {
        return StaffAuthRateLimit::passwordResetOtp($identityKey);
    }

    private function passwordResetOtpAttemptKey(string $identityKey): string
    {
        return StaffAuthRateLimit::passwordResetOtpAttempts($identityKey);
    }

    private function findActiveStaffByUsername(string $raw): ?User
    {
        return StaffUserLookup::findActiveByUsername($raw);
    }

    /**
     * Older builds keyed rate limits for emails like 7820288@gmail.com as
     * phone:7820288. Drop those locks so a real email login is not stuck.
     */
    private function clearLegacyMiskeyedPhoneLocks(string $raw, string $ip): void
    {
        $legacy = StaffUserLookup::legacyMiskeyedPhoneIdentity($raw);
        if ($legacy === null) {
            return;
        }

        RateLimiter::clear(StaffAuthRateLimit::pinIp($legacy, $ip));
        RateLimiter::clear(StaffAuthRateLimit::pinAccount($legacy));
        RateLimiter::clear(StaffAuthRateLimit::posPasswordIp($legacy, $ip));
        RateLimiter::clear(StaffAuthRateLimit::phoneLoginIp($legacy, $ip));
        foreach (StaffAuthRateLimit::legacyKeysForIdentity($legacy, $ip) as $key) {
            RateLimiter::clear($key);
        }
    }

    private function verifyStaffPassword(User $user, string $plain): bool
    {
        $hash = $user->getAuthPassword();

        return is_string($hash) && $hash !== '' && Hash::check($plain, $hash);
    }

    private function staffHasAdminPassword(User $user): bool
    {
        $hash = $user->getAuthPassword();

        return is_string($hash) && $hash !== '';
    }

    private function canSignInToPos(User $user): bool
    {
        $permissions = app(\App\Services\PermissionService::class);

        return $permissions->hasPermission($user, 'pos.access')
            || $permissions->hasPermission($user, 'kds.view')
            || $permissions->hasPermission($user, 'admin.access');
    }

    private function issuePosStaffToken(User $user, string $errorField = 'pin', ?string $deviceIdentifier = null): JsonResponse
    {
        $user->update(['last_login_at' => now()]);
        $user->loadMissing('role');

        if (!$this->canSignInToPos($user)) {
            throw ValidationException::withMessages([
                $errorField => ['You do not have permission to sign in on staff devices.'],
            ]);
        }

        $tokenName = 'staff-pos-' . $user->id;
        if (is_string($deviceIdentifier) && $deviceIdentifier !== '') {
            $tokenName .= '-' . $this->sanitizeDeviceIdentifierForTokenName($deviceIdentifier);
        }

        $token = $user->createToken(
            $tokenName,
            ['staff'],
            now()->addHours((int) config('sanctum.pos_token_ttl_hours')),
        )->plainTextToken;

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'user' => $this->serializeStaffUser($user),
        ]);
    }

    /**
     * Keep Sanctum token names safe and matchable for device revoke on disable.
     */
    private function sanitizeDeviceIdentifierForTokenName(string $identifier): string
    {
        $safe = preg_replace('/[^A-Za-z0-9\-_]/', '-', $identifier) ?? '';
        $safe = trim($safe, '-_');

        return $safe !== '' ? substr($safe, 0, 80) : 'device';
    }

    /**
     * Admin SPA login — Sanctum stateful session cookie (no PAT in localStorage).
     */
    private function issueAdminStaffSession(Request $request, User $user, string $errorField = 'phone'): JsonResponse
    {
        $user->update(['last_login_at' => now()]);
        $user->loadMissing('role');

        if (!app(\App\Services\PermissionService::class)->hasPermission($user, 'admin.access')) {
            throw ValidationException::withMessages([
                $errorField => ['You do not have permission to access the admin panel.'],
            ]);
        }

        Auth::guard('web')->login($user);
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return response()->json([
            'message' => 'Login successful',
            'user' => $this->serializeStaffUser($user),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeStaffUser(User $user): array
    {
        $roleSlug = $user->role?->slug;
        $permissions = $this->resolvePermissionSlugs($user);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $roleSlug,
            'permissions' => $permissions,
            'pos_staff_role' => $roleSlug,
            'pos_staff_permissions' => $permissions,
            'pos_idle_lock_minutes' => $user->pos_idle_lock_minutes,
            'pos_idle_lock_minutes_resolved' => $user->resolvedPosIdleLockMinutes(),
        ];
    }
}
