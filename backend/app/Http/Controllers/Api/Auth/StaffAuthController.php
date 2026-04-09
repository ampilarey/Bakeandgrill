<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
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
            'username' => 'required|string|email|max:255',
            'pin'      => 'required|string|min:4|max:8',
            'device_identifier' => 'nullable|string',
        ]);

        $pin      = $request->pin;
        $username = strtolower(trim($request->username));

        // Rate-limit per username+IP to prevent credential stuffing.
        $rateKey = 'staff-pin:' . $username . ':' . $request->ip();

        if (RateLimiter::tooManyAttempts($rateKey, 5)) {
            $seconds = RateLimiter::availableIn($rateKey);
            throw ValidationException::withMessages([
                'pin' => ['Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        // Identify the candidate with a single indexed lookup, then verify one hash.
        $user = User::where('email', $username)
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

        // Create token with 'staff' ability
        $token = $user->createToken('staff-' . $user->id, ['staff'])->plainTextToken;

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'user' => [
                'id'          => $user->id,
                'name'        => $user->name,
                'email'       => $user->email,
                'role'        => $user->role?->slug,
                'permissions' => $this->resolvePermissionSlugs($user),
            ],
        ]);
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
     */
    private function resolvePermissionSlugs(\App\Models\User $user): array
    {
        if ($user->role?->slug === 'owner') {
            return \App\Models\Permission::pluck('slug')->toArray();
        }

        $allPermissions = \App\Models\Permission::orderBy('slug')->get();
        $userOverrides  = $user->permissions()->get()->keyBy('slug');
        $rolePerms      = $user->role
            ? $user->role->permissions()->pluck('slug')->flip()
            : collect();

        return $allPermissions->filter(function (\App\Models\Permission $p) use ($userOverrides, $rolePerms) {
            $override = $userOverrides->get($p->slug);
            if ($override !== null) {
                return (bool) $override->pivot->granted;
            }

            return $rolePerms->has($p->slug);
        })->pluck('slug')->toArray();
    }

    /**
     * Get current staff user.
     */
    public function me(Request $request)
    {
        if (! $request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $user = $request->user();
        $user->loadMissing('role');

        return response()->json([
            'user' => [
                'id'          => $user->id,
                'name'        => $user->name,
                'email'       => $user->email,
                'role'        => $user->role?->slug,
                'permissions' => $this->resolvePermissionSlugs($user),
            ],
        ]);
    }
}
