<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Device;
use App\Models\User;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Owner SMS when a POS terminal registers and is waiting for approval.
 *
 * Manual approval only works if the owner hears about the pending device
 * without having the admin open — this is that notification. Rate-limited
 * per device identifier so a till retrying its first request does not spam;
 * approval ends the alerts naturally because the device stops being pending.
 */
final class DeviceApprovalAlert
{
    private const INTERVAL_SECONDS = 21600; // one alert per device per 6h

    public static function send(Device $device, ?User $firstUser): void
    {
        if (!Cache::add('device-approval-alert:' . $device->identifier, 1, self::INTERVAL_SECONDS)) {
            return; // already alerted recently
        }

        $who = $firstUser !== null ? ' (first login: ' . $firstUser->name . ')' : '';

        try {
            foreach (OwnerPhones::for('owner_device_approval') as $phone) {
                app(SmsService::class)->send(new SmsMessage(
                    to: $phone,
                    message: 'New POS device "' . $device->name . '" is waiting for approval'
                        . $who . '. Approve it in Admin -> Settings -> Devices.',
                    type: 'owner_device_approval',
                    referenceType: 'device',
                    referenceId: (string) $device->id,
                    idempotencyKey: 'device-approval:' . $device->id . ':' . now()->format('Y-m-d-H') . ':' . $phone,
                ));
            }
        } catch (\Throwable $e) {
            Log::warning('device approval alert SMS could not be sent', [
                'device_id' => $device->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
