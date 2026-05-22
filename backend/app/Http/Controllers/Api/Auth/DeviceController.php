<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\Shift;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    /**
     * Pre-provision a device from the admin panel — auto-approved.
     *
     * The cashier normally just opens the POS in a browser and the
     * `selfRegister` endpoint creates a pending row to approve. That covers
     * 100 % of interactive POS flows. This endpoint is the escape hatch for
     * headless / non-interactive setups (KDS screens, manager displays)
     * where nobody will type a login: the owner creates the row in advance,
     * then opens the target device once at `/pos?device=<identifier>` so
     * it picks up the pre-assigned id and skips the pending step.
     */
    public function register(Request $request)
    {
        $data = $request->validate([
            'name'       => 'required|string|max:100',
            'identifier' => 'nullable|string|max:100|regex:/^[A-Za-z0-9\-_]+$/',
            'type'       => 'required|string|max:50',
            'ip_address' => 'nullable|string|max:50',
        ]);

        // Default identifier embeds the device type so KDS-… vs POS-… is
        // obvious at a glance in the admin device list.
        $prefix = strtoupper((string) ($data['type'] ?? 'pos'));
        $identifier = $data['identifier']
            ?? $prefix . '-' . strtoupper(substr(md5(uniqid('', true)), 0, 8));

        $device = Device::updateOrCreate(
            ['identifier' => $identifier],
            [
                'name'         => $data['name'],
                'type'         => $data['type'],
                'ip_address'   => $data['ip_address'] ?? null,
                'is_active'    => true,
                'status'       => 'approved',
                'last_seen_at' => now(),
            ],
        );

        app(AuditLogService::class)->log('device.registered', 'Device', $device->id, [], $device->toArray(), [], $request);

        return response()->json([
            'device'     => $device,
            'identifier' => $device->identifier,
        ]);
    }

    /**
     * Self-registration from a POS device after staff login.
     * Creates a pending approval request if device is new.
     */
    public function selfRegister(Request $request)
    {
        $data = $request->validate([
            'name'       => 'required|string|max:100',
            'identifier' => 'required|string|max:100',
            'type'       => 'nullable|string|max:50',
        ]);

        $existing = Device::where('identifier', $data['identifier'])->first();

        if ($existing) {
            if ($request->user() && $existing->user_id === null) {
                $existing->update([
                    'user_id' => $request->user()->id,
                    'last_seen_at' => now(),
                    'ip_address' => $request->ip(),
                ]);
            } else {
                $existing->update(['last_seen_at' => now(), 'ip_address' => $request->ip()]);
            }
            return response()->json(['device' => $existing->fresh(), 'status' => $existing->status]);
        }

        $device = Device::create([
            'name'         => $data['name'],
            'identifier'   => $data['identifier'],
            'type'         => $data['type'] ?? 'pos',
            'user_id'      => $request->user()?->id,
            'ip_address'   => $request->ip(),
            'is_active'    => false,
            'status'       => 'pending',
            'last_seen_at' => now(),
        ]);

        app(AuditLogService::class)->log('device.self_registered', 'Device', $device->id, [], $device->toArray(), [], $request);

        return response()->json(['device' => $device, 'status' => 'pending']);
    }

    /**
     * Check own device status (called by POS while waiting for approval).
     */
    public function selfStatus(Request $request)
    {
        $identifier = $request->header('X-Device-Identifier')
            ?? $request->header('X-Device-Id')
            ?? $request->input('identifier');

        if (!$identifier) {
            return response()->json(['status' => 'unknown']);
        }

        $device = Device::where('identifier', $identifier)->first();
        if (!$device) {
            return response()->json(['status' => 'unregistered']);
        }

        return response()->json([
            'status' => $device->status,
            'is_active' => $device->is_active,
            'id' => $device->id,
        ]);
    }

    /**
     * List pending approval requests.
     */
    public function pending()
    {
        return response()->json([
            'devices' => Device::where('status', 'pending')->orderBy('created_at', 'desc')->get(),
        ]);
    }

    /**
     * Approve a pending device, optionally renaming it.
     */
    public function approve(int $id, Request $request)
    {
        $data = $request->validate(['name' => 'nullable|string|max:100']);
        $device = Device::findOrFail($id);
        $updates = ['status' => 'approved', 'is_active' => true];
        if (!empty($data['name'])) {
            $updates['name'] = $data['name'];
        }
        $device->update($updates);
        app(AuditLogService::class)->log('device.approved', 'Device', $device->id, ['status' => 'pending'], ['status' => 'approved'], [], $request);
        return response()->json(['device' => $device]);
    }

    /**
     * Reject a pending device.
     */
    public function reject(int $id)
    {
        $device = Device::findOrFail($id);
        $device->update(['status' => 'rejected', 'is_active' => false]);
        app(AuditLogService::class)->log('device.rejected', 'Device', $device->id, ['status' => 'pending'], ['status' => 'rejected'], [], request());
        return response()->json(['device' => $device]);
    }

    /**
     * List devices.
     */
    public function index()
    {
        $openShiftIds = Shift::whereNull('closed_at')->pluck('id', 'device_id');

        $devices = Device::with('user:id,name')
            ->orderBy('name')
            ->get()
            ->map(function (Device $device) use ($openShiftIds) {
                $data = $device->toArray();
                $openShiftId = $openShiftIds->get($device->id);
                if ($openShiftId) {
                    $data['open_shift_id'] = $openShiftId;
                }
                $data['registered_by'] = $device->user?->name;

                return $data;
            });

        return response()->json([
            'data' => $devices,
        ]);
    }

    /**
     * Update device fields (is_active, name, etc.)
     */
    public function update(int $id, Request $request)
    {
        $data = $request->validate([
            'is_active' => 'sometimes|boolean',
            'name'      => 'sometimes|string|max:100',
        ]);
        $device = Device::findOrFail($id);
        $device->update($data);
        return response()->json(['device' => $device->fresh()]);
    }

    /**
     * Delete a device.
     */
    public function destroy(int $id)
    {
        $device = Device::findOrFail($id);
        $device->delete();
        return response()->json(['message' => 'Device deleted.']);
    }

    /**
     * Disable device.
     */
    public function disable(int $id)
    {
        $device = Device::findOrFail($id);
        $device->update(['is_active' => false]);
        return response()->json(['device' => $device]);
    }

    /**
     * Enable device.
     */
    public function enable(int $id)
    {
        $device = Device::findOrFail($id);
        $device->update(['is_active' => true]);
        return response()->json(['device' => $device]);
    }
}
