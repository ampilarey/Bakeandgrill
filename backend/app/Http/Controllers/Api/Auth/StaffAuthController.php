<?php

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
     */
    public function pinLogin(Request $request)
    {
        $request->validate([
            'pin' => 'required|string|min:4|max:8',
            'device_identifier' => 'nullable|string',
        ]);

        $pin = $request->pin;
        $rateKey = 'staff-pin:' . $request->ip();

        if (RateLimiter::tooManyAttempts($rateKey, 5)) {
            $seconds = RateLimiter::availableIn($rateKey);
            throw ValidationException::withMessages([
                'pin' => ['Too many attempts. Try again in ' . ceil($seconds / 60) . ' minutes.'],
            ]);
        }

        $user = User::where('is_active', true)
            ->whereNotNull('pin_hash')
            ->get()
            ->first(function (User $user) use ($pin) {
                return Hash::check($pin, $user->pin_hash);
            });

        if (!$user) {
            RateLimiter::hit($rateKey, 900); // 15 minutes
            throw ValidationException::withMessages([
                'pin' => ['Invalid PIN.'],
            ]);
        }

        RateLimiter::clear($rateKey);
        $user->update(['last_login_at' => now()]);

        $token = $user->createToken('staff-' . $user->id)->plainTextToken;

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role?->slug,
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
     * Get current staff user.
     */
    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role?->slug,
            ],
        ]);
    }
}
