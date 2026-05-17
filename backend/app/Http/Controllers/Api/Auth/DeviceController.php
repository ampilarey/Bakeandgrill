<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    /**
     * Register or update a device (owner/admin initiated — auto-approved).
     */
    public function register(Request $request)
    {
        $data = $request->validate([
            'name'       => 'required|string|max:100',
            'identifier' => 'nullable|string|max:100',
            'type'       => 'required|string|max:50',
            'ip_address' => 'nullable|string|max:50',
        ]);

        $identifier = $data['identifier'] ?? 'ADMIN-' . strtoupper(substr(md5(uniqid()), 0, 8));

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

        return response()->json(['device' => $device]);
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
            $existing->update(['last_seen_at' => now(), 'ip_address' => $request->ip()]);
            return response()->json(['device' => $existing, 'status' => $existing->status]);
        }

        $device = Device::create([
            'name'         => $data['name'],
            'identifier'   => $data['identifier'],
            'type'         => $data['type'] ?? 'pos',
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

        return response()->json(['status' => $device->status, 'is_active' => $device->is_active]);
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
        return response()->json([
            'data' => Device::orderBy('name')->get(),
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
