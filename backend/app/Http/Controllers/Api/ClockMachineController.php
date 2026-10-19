<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Shifts\ClockMachine\ClockMachine;
use App\Http\Controllers\Controller;
use App\Models\ClockDevice;
use App\Models\ClockDevicePunch;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** Admin → Time Clock → Clock machine: allow clocks, match their numbers to staff. */
class ClockMachineController extends Controller
{
    public function index(): JsonResponse
    {
        $today = now()->startOfDay();
        $devices = ClockDevice::query()->orderByDesc('allowed_at')->orderBy('id')->get()->map(fn (ClockDevice $d) => [
            'id' => $d->id,
            'serial' => $d->serial,
            'name' => $d->name,
            'allowed' => $d->isAllowed(),
            'allowed_at' => $d->allowed_at?->toIso8601String(),
            'last_seen_at' => $d->last_seen_at?->toIso8601String(),
            'punches_today' => $d->punches()->where('punched_at', '>=', $today)->count(),
            'enrolled' => count((array) ($d->device_users ?? [])),
        ]);

        $names = [];
        foreach (ClockDevice::query()->get(['device_users']) as $d) {
            foreach ((array) ($d->device_users ?? []) as $no => $name) {
                $names[(string) $no] = $name;
            }
        }

        $staff = User::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'clock_user_no'])
            ->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'clock_user_no' => $u->clock_user_no,
                'name_on_clock' => $u->clock_user_no !== null ? ($names[$u->clock_user_no] ?? null) : null,
            ]);

        $recent = ClockDevicePunch::query()
            ->with('user:id,name')
            ->latest('punched_at')
            ->limit(30)
            ->get()
            ->map(fn (ClockDevicePunch $p) => [
                'id' => $p->id,
                'no' => $p->device_user_no,
                'staff' => $p->user?->name,
                'punched_at' => $p->punched_at->toIso8601String(),
                'result' => $p->result,
            ]);

        return response()->json([
            'devices' => $devices,
            'staff' => $staff,
            'unmatched' => ClockMachine::unmatched(),
            'recent' => $recent,
            'push_url' => 'http://' . parse_url((string) config('app.url'), PHP_URL_HOST),
        ]);
    }

    public function updateDevice(Request $request, int $id): JsonResponse
    {
        $device = ClockDevice::query()->findOrFail($id);
        $data = $request->validate([
            'name' => ['sometimes', 'nullable', 'string', 'max:80'],
            'allowed' => ['sometimes', 'boolean'],
        ]);
        if (array_key_exists('name', $data)) {
            $device->name = $data['name'];
        }
        if (array_key_exists('allowed', $data)) {
            // Allowing again keeps the first date, so punches from before it stay history.
            $device->allowed_at = $data['allowed'] ? ($device->allowed_at ?? now()) : null;
        }
        $device->save();
        if ($device->isAllowed()) {
            ClockMachine::applyWaiting($device);
        }
        app(AuditLogService::class)->log('clock_device.updated', 'ClockDevice', $device->id, [], $data, [], $request);

        return response()->json(['ok' => true]);
    }

    public function destroyDevice(Request $request, int $id): JsonResponse
    {
        $device = ClockDevice::query()->findOrFail($id);
        if ($device->isAllowed()) {
            throw ValidationException::withMessages(['device' => 'Stop this clock first; its punches stay on the time clock.']);
        }
        app(AuditLogService::class)->log('clock_device.removed', 'ClockDevice', $device->id, ['serial' => $device->serial], [], [], $request);
        $device->delete();

        return response()->json(['ok' => true]);
    }

    public function assign(Request $request, int $userId): JsonResponse
    {
        $user = User::query()->findOrFail($userId);
        $data = $request->validate([
            'clock_user_no' => ['nullable', 'string', 'max:20', 'regex:/^[0-9A-Za-z]+$/'],
        ]);
        $no = ClockMachine::normaliseNo($data['clock_user_no'] ?? null);
        if ($no !== null) {
            $taken = User::query()->where('clock_user_no', $no)->where('id', '!=', $user->id)->first();
            if ($taken !== null) {
                throw ValidationException::withMessages(['clock_user_no' => "Number {$no} is already {$taken->name}'s."]);
            }
        }
        $old = $user->clock_user_no;
        ClockMachine::assign($user, $no);
        app(AuditLogService::class)->log('staff.clock_user_no', 'User', $user->id, ['clock_user_no' => $old], ['clock_user_no' => $no], [], $request);

        return response()->json(['ok' => true, 'clock_user_no' => $no]);
    }
}
