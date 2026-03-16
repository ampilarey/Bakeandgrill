<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryDriver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

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
            'pin'   => ['required', 'string', 'min:4', 'max:6'],
        ]);

        $driver = DeliveryDriver::where('phone', $validated['phone'])
            ->where('is_active', true)
            ->first();

        if (!$driver || !$driver->pin || !Hash::check($validated['pin'], $driver->pin)) {
            return response()->json(['message' => 'Invalid phone number or PIN.'], 401);
        }

        // Revoke old driver tokens to prevent accumulation
        $driver->tokens()->delete();

        $token = $driver->createToken('driver-app', ['driver'])->plainTextToken;

        $driver->update(['last_login_at' => now()]);

        return response()->json([
            'token'  => $token,
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
            'id'           => $driver->id,
            'name'         => $driver->name,
            'phone'        => $driver->phone,
            'vehicle_type' => $driver->vehicle_type,
            'is_active'    => $driver->is_active,
            'has_pin'      => (bool) $driver->pin,
            'last_login_at' => $driver->last_login_at?->toIso8601String(),
        ];
    }
}
