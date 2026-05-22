<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Http\Controllers\Controller;
use App\Models\User;
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
    public function pinLogin(Request $request)
    {
        $request->validate([
            'username' => 'required|string|max:255',
            'pin' => 'required|string|min:4|max:8',
            'device_identifier' => 'nullable|string',
        ]);

        $pin = $request->pin;
        $username = strtolower(trim($request->username));

        // Rate-limit per username+IP to prevent credential stuffing.
        $rateKey = 'staff-pin:' . $username . ':' . $request->ip();

        if (RateLimiter::tooManyAttempts($rateKey, 5)) {
            $seconds = RateLimiter::availableIn($rateKey);
            throw ValidationException::withMessages([
                'pin' => ['Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        // Look up by phone first (primary), then fall back to email.
        $user = User::where(function ($q) use ($username) {
            $q->where('phone', $username)
                ->orWhere('email', $username);
        })
            ->where('is_active', true)
            ->whereNotNull('pin_hash')
            ->first();

        if (!$user || !Hash::check($pin, $user->pin_hash)) {
            RateLimiter::hit($rateKey, 900); // 15-minute decay
            throw ValidationException::withMessages([
                'pin' => ['Invalid email or PIN.'],
            ]);
        }

        RateLimiter::clear($rateKey);
        $user->update(['last_login_at' => now()]);

        $user->loadMissing('role');
        if (!app(\App\Services\PermissionService::class)->hasPermission($user, 'pos.access')) {
            throw ValidationException::withMessages([
                'pin' => ['You do not have permission to access the POS.'],
            ]);
        }

        // Create token with 'staff' ability
        $token = $user->createToken('staff-' . $user->id, ['staff'])->plainTextToken;

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'user' => $this->serializeStaffUser($user),
        ]);
    }

    /**
     * Phone + password login for admin dashboard.
     */
    public function phoneLogin(Request $request)
    {
        $request->validate([
            'phone' => 'required|string|max:20',
            'password' => 'required|string|min:6',
        ]);

        $phone = trim($request->phone);
        $rateKey = 'staff-phone-login:' . $phone . ':' . $request->ip();

        if (RateLimiter::tooManyAttempts($rateKey, 5)) {
            $seconds = RateLimiter::availableIn($rateKey);
            throw ValidationException::withMessages([
                'phone' => ['Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        $user = User::where('phone', $phone)
            ->where('is_active', true)
            ->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            RateLimiter::hit($rateKey, 900);
            throw ValidationException::withMessages([
                'phone' => ['Invalid phone number or password.'],
            ]);
        }

        RateLimiter::clear($rateKey);
        $user->update(['last_login_at' => now()]);

        $token = $user->createToken('staff-' . $user->id, ['staff'])->plainTextToken;

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'user' => $this->serializeStaffUser($user),
        ]);
    }

    /**
     * Request a password-reset OTP — sends SMS to the registered phone.
     */
    public function passwordResetRequest(Request $request)
    {
        $request->validate(['phone' => 'required|string|max:20']);

        $phone = trim($request->phone);
        $rateKey = 'staff-pwd-reset-req:' . $phone;

        if (RateLimiter::tooManyAttempts($rateKey, 3)) {
            return response()->json(['message' => 'Too many OTP requests. Please wait a few minutes.'], 429);
        }

        // Always return 200 regardless of whether the phone exists (prevents enumeration).
        $user = User::where('phone', $phone)->where('is_active', true)->first();

        if ($user) {
            $otp = (string) random_int(100000, 999999);
            $cacheKey = 'staff-pwd-reset:' . $phone;
            Cache::put($cacheKey, Hash::make($otp), now()->addMinutes(10));

            app(SmsService::class)->send(new SmsMessage(
                to: $phone,
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
            'phone' => 'required|string|max:20',
            'otp' => 'required|string|size:6',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $phone = trim($request->phone);
        $cacheKey = 'staff-pwd-reset:' . $phone;
        $stored = Cache::get($cacheKey);

        if (!$stored || !Hash::check($request->otp, $stored)) {
            throw ValidationException::withMessages([
                'otp' => ['Invalid or expired OTP.'],
            ]);
        }

        $user = User::where('phone', $phone)->where('is_active', true)->first();

        if (!$user) {
            throw ValidationException::withMessages([
                'phone' => ['Account not found.'],
            ]);
        }

        $user->update(['password' => Hash::make($request->password)]);
        Cache::forget($cacheKey);

        // Revoke all existing staff tokens so old sessions are invalidated.
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
