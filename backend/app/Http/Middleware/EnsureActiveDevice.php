<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Optional device metadata for POS audit/reporting.
 *
 * Never blocks sales — staff auth + permissions + shift gate access.
 * When X-Device-Identifier is present, upserts a device row and attaches
 * it to the request. Missing header is allowed.
 */
class EnsureActiveDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $identifier = $request->header('X-Device-Identifier')
            ?? $request->header('X-Device-Id');

        if (!$identifier) {
            $request->attributes->set('device', null);

            return $next($request);
        }

        $user = $request->user();
        $device = Device::where('identifier', $identifier)->first();

        if (!$device) {
            $device = Device::create([
                'name'         => 'POS ' . $identifier,
                'identifier'   => $identifier,
                'type'         => 'pos',
                'is_active'    => true,
                'status'       => 'approved',
                'last_seen_at' => now(),
                'ip_address'   => $request->ip(),
                'last_user_id' => $user?->id,
            ]);
        } else {
            $updates = [
                'last_seen_at' => now(),
                'ip_address'   => $request->ip(),
            ];
            if ($user) {
                $updates['last_user_id'] = $user->id;
            }
            $device->update($updates);
            $device->refresh();
        }

        $request->attributes->set('device', $device);

        return $next($request);
    }
}
