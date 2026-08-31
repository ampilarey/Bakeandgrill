<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Device metadata for POS audit/reporting + optional terminal identity gate.
 *
 * When `pos.require_device_header` is true, missing X-Device-Identifier
 * returns 428 (this middleware only runs on `device.active` routes).
 * Owner-disabled devices (is_active=false) are always rejected when a
 * header is present. Set POS_STRICT_DEVICE_APPROVAL=true to also require
 * approved status. When the header is present, upserts a device row and
 * attaches it to the request.
 */
class EnsureActiveDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $identifier = $request->header('X-Device-Identifier')
            ?? $request->header('X-Device-Id');

        if (!$identifier) {
            if (config('pos.require_device_header')) {
                return response()->json([
                    'message' => 'This terminal must identify itself — reopen the POS app.',
                    'code' => 'device_header_required',
                ], 428);
            }

            $request->attributes->set('device', null);

            return $next($request);
        }

        $user = $request->user();
        $device = Device::where('identifier', $identifier)->first();

        if (!$device) {
            // Creates exactly what /devices/self-register would create for
            // the same request: approved when strict mode is off (setup-time
            // convenience), pending when it is on — and under strict mode the
            // owner is SMS-alerted so the till isn't silently stuck. Approval
            // itself happens only in Admin → Settings → Devices; since
            // 2026-08-31 nothing self-promotes out of pending.
            $strict = (bool) config('pos.strict_device_approval', false);
            $device = Device::create([
                'name' => 'POS ' . $identifier,
                'identifier' => $identifier,
                'type' => 'pos',
                'is_active' => !$strict,
                'status' => $strict ? 'pending' : 'approved',
                'last_seen_at' => now(),
                'ip_address' => $request->ip(),
                'last_user_id' => $user?->id,
            ]);
            if ($device->status === 'pending') {
                \App\Services\DeviceApprovalAlert::send(
                    $device,
                    $user instanceof \App\Models\User ? $user : null,
                );
            }
        } else {
            $updates = [
                'last_seen_at' => now(),
                'ip_address' => $request->ip(),
            ];
            if ($user) {
                $updates['last_user_id'] = $user->id;
            }
            // Legacy rows from the old approval workflow — auto-approve only when strict mode is off.
            if (
                !config('pos.strict_device_approval', false)
                && $device->status === 'pending'
                && ($device->type === 'pos' || $device->type === null)
            ) {
                $updates['status'] = 'approved';
                $updates['is_active'] = true;
            }
            if ($device->last_seen_at === null || $device->last_seen_at->lt(now()->subMinute())) {
                $device->update($updates);
                $device->refresh();
            }
        }

        // A terminal that has never been approved is not the same as one the
        // owner switched off, and saying "disabled" sends them looking for a
        // switch they never touched.
        if (!$device->is_active && $device->status === 'pending') {
            return response()->json([
                'message' => 'This POS device is waiting for approval. Ask the owner to approve it in Settings → Devices.',
                'code' => 'device_not_approved',
            ], 403);
        }

        if (!$device->is_active) {
            return response()->json([
                'message' => 'This POS device has been disabled. Contact your manager.',
                'code' => 'device_disabled',
            ], 403);
        }

        if (config('pos.strict_device_approval', false) && $device->status !== 'approved') {
            return response()->json([
                'message' => 'This POS device is not approved yet.',
                'code' => 'device_not_approved',
            ], 403);
        }

        $request->attributes->set('device', $device);

        return $next($request);
    }
}
