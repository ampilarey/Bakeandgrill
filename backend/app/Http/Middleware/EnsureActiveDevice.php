<?php

declare(strict_types=1);

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
            ?? $request->header('X-Device-Id');

        if (!$identifier) {
            return response()->json([
                'message' => 'Device identifier required. Send the X-Device-Identifier header.',
            ], 422);
        }

        $device = Device::where('identifier', $identifier)->first();
        if (!$device) {
            return response()->json(['message' => 'Device not registered.'], 403);
        }

        if (!$device->is_active) {
            $status = $device->status ?? 'disabled';
            $message = match ($status) {
                'pending'  => 'Device pending approval.',
                'rejected' => 'Device rejected.',
                default    => 'Device disabled.',
            };
            return response()->json(['message' => $message, 'status' => $status], 403);
        }

        $user = $request->user();
        if ($user) {
            if ($device->user_id === null) {
                $device->update(['user_id' => $user->id]);
            } elseif ((int) $device->user_id !== (int) $user->id) {
                return response()->json([
                    'message' => 'This device is registered to another staff member.',
                ], 403);
            }
        }

        $device->update([
            'last_seen_at' => now(),
            'ip_address' => $request->ip(),
        ]);

        $request->attributes->set('device', $device);

        return $next($request);
    }
}
