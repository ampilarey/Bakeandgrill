<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryDriver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class DriverAuthController extends Controller
{
    /**
     * POST /api/auth/driver/pin-login
     *
     * Authenticate a delivery driver using phone + PIN.
     * Issues a Sanctum token with 'driver' ability.
     */
    public function pinLogin(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string'],
            'pin' => ['required', 'string', 'min:4', 'max:6'],
        ]);

        // Brute-force shield: 5 attempts per (phone + IP) per 5 minutes.
        // Driver PINs are 4-6 digits — without this gate, a single IP can
        // exhaust a 4-digit keyspace (10k) in seconds at modern throughput.
        // Key on phone+IP (not just IP) so one attacker enumerating multiple
        // numbers from the same IP is still capped per-number, and one user
        // on a NATed mobile network isn't punished for unrelated traffic.
        $key = 'driver-pin:' . sha1(strtolower($validated['phone']) . '|' . $request->ip());
        // Account-level shield: attackers rotating IPs must not get a fresh
        // budget per IP against the same 4-digit PIN. 20 attempts / hour per
        // phone regardless of source (progressive lockout, self-heals).
        $accountKey = 'driver-pin-acct:' . sha1(strtolower($validated['phone']));
        if (RateLimiter::tooManyAttempts($key, 5) || RateLimiter::tooManyAttempts($accountKey, 20)) {
            $retryAfter = max(RateLimiter::availableIn($key), RateLimiter::availableIn($accountKey));

            return response()->json([
                'message' => "Too many attempts. Try again in {$retryAfter} seconds.",
            ], 429);
        }

        $driver = DeliveryDriver::where('phone', $validated['phone'])
            ->where('is_active', true)
            ->first();

        if (!$driver || !$driver->pin || !Hash::check($validated['pin'], $driver->pin)) {
            RateLimiter::hit($key, 300); // 5-minute window
            RateLimiter::hit($accountKey, 3600); // 1-hour account window

            return response()->json(['message' => 'Invalid phone number or PIN.'], 401);
        }

        RateLimiter::clear($key);
        RateLimiter::clear($accountKey);

        // Revoke old driver tokens to prevent accumulation
        $driver->tokens()->delete();

        $token = $driver->createToken(
            'driver-app',
            ['driver'],
            now()->addHours((int) config('sanctum.driver_token_ttl_hours')),
        )->plainTextToken;

        $driver->update(['last_login_at' => now()]);

        return response()->json([
            'token' => $token,
            'driver' => $this->driverData($driver),
        ]);
    }

    /**
     * GET /api/driver/me
     */
    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'driver' => $this->driverData($request->user()),
        ]);
    }

    /**
     * POST /api/auth/driver/logout
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    private function driverData(DeliveryDriver $driver): array
    {
        return [
            'id' => $driver->id,
            'name' => $driver->name,
            'phone' => $driver->phone,
            'vehicle_type' => $driver->vehicle_type,
            'is_active' => $driver->is_active,
            'has_pin' => (bool) $driver->pin,
            'last_login_at' => $driver->last_login_at?->toIso8601String(),
        ];
    }
}
