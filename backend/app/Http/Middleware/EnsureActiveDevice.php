<?php

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $identifier = $request->header('X-Device-Identifier')
            ?? $request->header('X-Device-Id')
            ?? $request->input('device_identifier');

        if (!$identifier) {
            return response()->json(['message' => 'Device identifier required.'], 422);
        }

        $device = Device::where('identifier', $identifier)->first();
        if (!$device) {
            return response()->json(['message' => 'Device not registered.'], 403);
        }

        if (!$device->is_active) {
            return response()->json(['message' => 'Device disabled.'], 403);
        }

        $device->update([
            'last_seen_at' => now(),
            'ip_address' => $request->ip(),
        ]);

        $request->attributes->set('device', $device);

        return $next($request);
    }
}
