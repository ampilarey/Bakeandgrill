<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Signage;

use App\Http\Controllers\Controller;
use App\Models\SignageDevice;
use App\Models\SignageScreen;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

final class SignageDeviceController extends Controller
{
    private const COMMANDS = [
        'refresh',
        'reload_cache',
        'restart',
        'skip',
        'pause',
        'resume',
        'black_screen',
        'maintenance',
    ];

    public function __construct(private readonly AuditLogService $audit) {}

    public function heartbeat(Request $request): JsonResponse
    {
        $data = $request->validate([
            'device_id' => ['required', 'string', 'max:64'],
            'screen' => ['nullable', 'string', 'max:120'],
            'current_slide' => ['nullable', 'string', 'max:120'],
            'playlist_version' => ['nullable', 'string', 'max:120'],
            'browser' => ['nullable', 'string', 'max:255'],
            'resolution' => ['nullable', 'string', 'max:40'],
            'cache_status' => ['nullable', 'string', 'max:40'],
            'failed_assets' => ['nullable', 'integer', 'min:0'],
            'mem' => ['nullable', 'numeric'],
            'pairing_code' => ['nullable', 'string', 'max:8'],
            'build_version' => ['nullable', 'string', 'max:40'],
        ]);

        $screenId = null;
        if (! empty($data['screen'])) {
            $screen = SignageScreen::query()
                ->where(function ($q) use ($data) {
                    $q->where('slug', $data['screen']);
                    if (ctype_digit((string) $data['screen'])) {
                        $q->orWhere('id', (int) $data['screen']);
                    }
                })
                ->first();
            $screenId = $screen?->id;
        }

        $device = SignageDevice::query()->firstOrNew(['device_id' => $data['device_id']]);
        if (! $device->exists) {
            $device->pairing_code = $this->makePairingCode();
            $device->approved = false;
        }

        if (! empty($data['pairing_code']) && ! $device->approved && ! $device->pairing_code) {
            $device->pairing_code = strtoupper((string) $data['pairing_code']);
        }

        if (! $device->approved && ! $device->pairing_code) {
            $device->pairing_code = $this->makePairingCode();
        }

        $device->last_seen_at = now();
        $device->meta = array_filter([
            'screen_slug' => $data['screen'] ?? null,
            'current_slide' => $data['current_slide'] ?? null,
            'playlist_version' => $data['playlist_version'] ?? null,
            'browser' => $data['browser'] ?? null,
            'resolution' => $data['resolution'] ?? null,
            'cache_status' => $data['cache_status'] ?? null,
            'failed_assets' => $data['failed_assets'] ?? null,
            'mem' => $data['mem'] ?? null,
            'build_version' => $data['build_version'] ?? null,
        ], static fn ($v) => $v !== null);

        if ($screenId && $device->approved && ! $device->screen_id) {
            $device->screen_id = $screenId;
        }

        $device->save();
        $device->load('screen:id,name,slug');

        $command = $device->queued_command;
        if ($command) {
            $device->queued_command = null;
            $device->save();
        }

        return response()->json([
            'device' => [
                'id' => $device->id,
                'device_id' => $device->device_id,
                'pairing_code' => $device->approved ? null : $device->pairing_code,
                'approved' => (bool) $device->approved,
                'screen_id' => $device->screen_id,
                'screen_slug' => $device->screen?->slug,
            ],
            'command' => $command,
        ]);
    }

    public function index(): JsonResponse
    {
        $devices = SignageDevice::query()
            ->with('screen:id,name,slug')
            ->orderByDesc('last_seen_at')
            ->get()
            ->map(fn (SignageDevice $d) => $this->serialize($d));

        return response()->json(['data' => $devices]);
    }

    public function approve(Request $request, SignageDevice $device): JsonResponse
    {
        $data = $request->validate([
            'screen_id' => ['nullable', 'exists:signage_screens,id'],
            'group_id' => ['nullable', 'exists:signage_groups,id'],
        ]);

        $screenId = $data['screen_id'] ?? null;
        if (! $screenId && ! empty($data['group_id'])) {
            $screen = SignageScreen::query()
                ->where('group_id', $data['group_id'])
                ->orderBy('id')
                ->first();
            $screenId = $screen?->id;
        }

        $old = ['approved' => $device->approved, 'screen_id' => $device->screen_id];
        $device->approved = true;
        $device->screen_id = $screenId;
        $device->pairing_code = null;
        $device->save();

        $this->audit->log(
            'signage.device.approve',
            'signage_device',
            $device->id,
            $old,
            ['approved' => true, 'screen_id' => $screenId],
            [],
            $request,
        );

        return response()->json(['data' => $this->serialize($device->fresh('screen'))]);
    }

    public function command(Request $request, SignageDevice $device): JsonResponse
    {
        $data = $request->validate([
            'command' => ['required', Rule::in(self::COMMANDS)],
            'payload' => ['nullable', 'array'],
        ]);

        $queued = [
            'type' => $data['command'],
            'payload' => $data['payload'] ?? [],
            'queued_at' => now()->toIso8601String(),
        ];
        $device->queued_command = $queued;
        $device->save();

        $this->audit->log(
            'signage.device.command',
            'signage_device',
            $device->id,
            [],
            ['command' => $data['command']],
            [],
            $request,
        );

        return response()->json(['data' => $this->serialize($device->fresh('screen'))]);
    }

    private function serialize(SignageDevice $d): array
    {
        $online = $d->last_seen_at && $d->last_seen_at->gt(now()->subMinutes(2));

        return [
            'id' => $d->id,
            'device_id' => $d->device_id,
            'pairing_code' => $d->pairing_code,
            'approved' => (bool) $d->approved,
            'screen_id' => $d->screen_id,
            'screen' => $d->screen
                ? ['id' => $d->screen->id, 'name' => $d->screen->name, 'slug' => $d->screen->slug]
                : null,
            'last_seen_at' => $d->last_seen_at?->toIso8601String(),
            'online' => $online,
            'meta' => $d->meta ?? [],
            'queued_command' => $d->queued_command,
            'store_id' => $d->store_id,
        ];
    }

    private function makePairingCode(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $code = '';
        for ($i = 0; $i < 6; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return $code;
    }
}
