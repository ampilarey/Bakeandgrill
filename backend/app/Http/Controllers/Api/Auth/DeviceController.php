<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    /**
     * Register or update a device.
     */
    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'identifier' => 'required|string|max:100',
            'type' => 'required|string|max:50',
            'ip_address' => 'nullable|string|max:50',
        ]);

        $device = Device::updateOrCreate(
            ['identifier' => $data['identifier']],
            [
                'name' => $data['name'],
                'type' => $data['type'],
                'ip_address' => $data['ip_address'] ?? null,
                'is_active' => true,
                'last_seen_at' => now(),
            ]
        );

        app(AuditLogService::class)->log(
            'device.registered',
            'Device',
            $device->id,
            [],
            $device->toArray(),
            [],
            $request
        );

        return response()->json([
            'device' => $device,
        ]);
    }

    /**
     * List devices.
     */
    public function index()
    {
        return response()->json([
            'devices' => Device::orderBy('name')->get(),
        ]);
    }

    /**
     * Disable device.
     */
    public function disable(int $id)
    {
        $device = Device::findOrFail($id);
        $device->update(['is_active' => false]);

        app(AuditLogService::class)->log(
            'device.disabled',
            'Device',
            $device->id,
            ['is_active' => true],
            ['is_active' => false],
            [],
            request()
        );

        return response()->json([
            'device' => $device,
        ]);
    }

    /**
     * Enable device.
     */
    public function enable(int $id)
    {
        $device = Device::findOrFail($id);
        $device->update(['is_active' => true]);

        app(AuditLogService::class)->log(
            'device.enabled',
            'Device',
            $device->id,
            ['is_active' => false],
            ['is_active' => true],
            [],
            request()
        );

        return response()->json([
            'device' => $device,
        ]);
    }
}
