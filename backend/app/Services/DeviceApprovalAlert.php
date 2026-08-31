<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Device;
use App\Models\SiteSetting;
use App\Models\User;
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

        $phone = trim((string) SiteSetting::get('business_phone', ''));
        if ($phone === '') {
            return;
        }

        $who = $firstUser !== null ? ' (first login: ' . $firstUser->name . ')' : '';

        try {
            app(SmsService::class)->send(new SmsMessage(
                to: $phone,
                message: 'New POS device "' . $device->name . '" is waiting for approval'
                    . $who . '. Approve it in Admin -> Settings -> Devices.',
                type: 'system',
                referenceType: 'device',
                referenceId: (string) $device->id,
            ));
        } catch (\Throwable $e) {
            Log::warning('device approval alert SMS could not be sent', [
                'device_id' => $device->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
