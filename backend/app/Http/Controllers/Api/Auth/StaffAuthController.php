<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\StaffUserLookup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class StaffAuthController extends Controller
{
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
        $username = strtolower(trim($request->username));
        $forAdmin = $request->input('intent') === 'admin';

        $rateKey = 'staff-pin:' . $username . ':' . $request->ip();
        if (RateLimiter::tooManyAttempts($rateKey, 5)) {
            $seconds = RateLimiter::availableIn($rateKey);
            throw ValidationException::withMessages([
                'pin' => ['Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        $user = $this->findActiveStaffByUsername($request->username);

        if (!$user) {
            RateLimiter::hit($rateKey, 900);
            throw ValidationException::withMessages([
                'pin' => ['Invalid mobile/email or PIN.'],
            ]);
        }

        if ($user->pin_hash === null) {
            RateLimiter::hit($rateKey, 900);
            throw ValidationException::withMessages([
                'pin' => ['No PIN is set on this account. Use Owner / admin sign-in with your admin password, or set a PIN in Admin → Staff.'],
            ]);
        }

        if (!Hash::check($pin, $user->pin_hash)) {
            RateLimiter::hit($rateKey, 900);
            throw ValidationException::withMessages([
                'pin' => ['Invalid mobile/email or PIN.'],
            ]);
        }

        RateLimiter::clear($rateKey);

        if ($forAdmin) {
            return $this->issueAdminStaffToken($user, 'pin');
        }

        return $this->issuePosStaffToken($user, 'pin');
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

        $username = strtolower(trim($request->username));
        $rateKey = 'staff-pos-pwd:' . $username . ':' . $request->ip();

        if (RateLimiter::tooManyAttempts($rateKey, 5)) {
            $seconds = RateLimiter::availableIn($rateKey);
            throw ValidationException::withMessages([
                'password' => ['Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        $user = $this->findActiveStaffByUsername($request->username);

        if (!$user || !$this->verifyStaffPassword($user, $request->password)) {
            RateLimiter::hit($rateKey, 900);
            throw ValidationException::withMessages([
                'password' => ['Invalid mobile/email or password.'],
            ]);
        }

        RateLimiter::clear($rateKey);

        return $this->issuePosStaffToken($user, 'password');
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
        $rateKey = 'staff-phone-login:' . strtolower($login) . ':' . $request->ip();

        if (RateLimiter::tooManyAttempts($rateKey, 5)) {
            $seconds = RateLimiter::availableIn($rateKey);
            throw ValidationException::withMessages([
                'phone' => ['Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        $user = $this->findActiveStaffByUsername($login);

        if (!$user) {
            RateLimiter::hit($rateKey, 900);
            throw ValidationException::withMessages([
                'phone' => ['Invalid mobile/email or password.'],
            ]);
        }

        if (!$this->staffHasAdminPassword($user)) {
            RateLimiter::hit($rateKey, 900);
            throw ValidationException::withMessages([
                'phone' => ['No admin password is set. Use PIN sign-in, Forgot password, or ask another owner to set one in Staff.'],
            ]);
        }

        if (!$this->verifyStaffPassword($user, $request->password)) {
            RateLimiter::hit($rateKey, 900);
            throw ValidationException::withMessages([
                'phone' => ['Invalid mobile/email or password.'],
            ]);
        }

        RateLimiter::clear($rateKey);

        return $this->issueAdminStaffToken($user, 'phone');
    }

    /**
     * Request a password-reset OTP — sends SMS to the registered phone.
     */
    public function passwordResetRequest(Request $request)
    {
        $request->validate(['phone' => 'required|string|max:255']);

        $login = strtolower(trim($request->phone));
        $rateKey = 'staff-pwd-reset-req:' . $login;

        if (RateLimiter::tooManyAttempts($rateKey, 3)) {
            return response()->json(['message' => 'Too many OTP requests. Please wait a few minutes.'], 429);
        }

        $user = $this->findActiveStaffByUsername($login);
        $smsPhone = $user?->phone;

        if ($user && $smsPhone) {
            $otp = (string) random_int(100000, 999999);
            $cacheKey = 'staff-pwd-reset:' . $login;
            Cache::put($cacheKey, Hash::make($otp), now()->addMinutes(10));

            app(SmsService::class)->send(new SmsMessage(
                to: $smsPhone,
                message: "Your Bake & Grill admin password reset code is: {$otp}. Valid for 10 minutes.",
                type: 'staff_password_reset',
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

        $login = strtolower(trim($request->phone));
        $cacheKey = 'staff-pwd-reset:' . $login;
        $stored = Cache::get($cacheKey);

        if (!$stored || !Hash::check($request->otp, $stored)) {
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

        $user->tokens()->where('name', 'like', 'staff-%')->delete();

        return response()->json(['message' => 'Password updated. Please log in with your new password.']);
    }

    /**
     * Logout (revoke token).
     */
    public function logout(Request $request)
    {
        $request->user()?->currentAccessToken()?->delete();

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
    public function me(Request $request)
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
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
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
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

    private function findActiveStaffByUsername(string $raw): ?User
    {
        return StaffUserLookup::findActiveByUsername($raw);
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

    private function issuePosStaffToken(User $user, string $errorField = 'pin'): JsonResponse
    {
        $user->update(['last_login_at' => now()]);
        $user->loadMissing('role');

        if (!$this->canSignInToPos($user)) {
            throw ValidationException::withMessages([
                $errorField => ['You do not have permission to sign in on staff devices.'],
            ]);
        }

        $token = $user->createToken(
            'staff-pos-' . $user->id,
            ['staff'],
            now()->addHours((int) config('sanctum.pos_token_ttl_hours')),
        )->plainTextToken;

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'user' => $this->serializeStaffUser($user),
        ]);
    }

    private function issueAdminStaffToken(User $user, string $errorField = 'phone'): JsonResponse
    {
        $user->update(['last_login_at' => now()]);
        $user->loadMissing('role');

        if (!app(\App\Services\PermissionService::class)->hasPermission($user, 'admin.access')) {
            throw ValidationException::withMessages([
                $errorField => ['You do not have permission to access the admin panel.'],
            ]);
        }

        $token = $user->createToken(
            'staff-' . $user->id,
            ['staff'],
            now()->addHours((int) config('sanctum.admin_token_ttl_hours')),
        )->plainTextToken;

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
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
