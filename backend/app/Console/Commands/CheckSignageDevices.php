<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Signage\Services\SignageDeviceHealth;
use App\Models\SignageDevice;
use App\Models\SiteSetting;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Every five minutes: which paired TVs have gone quiet or are stuck on one
 * slide. Each is alerted once — a log line always, an SMS to the business
 * phone when `signage_device_alert_sms` is on — and the flag clears when
 * the screen is back, so the next failure alerts again.
 */
class CheckSignageDevices extends Command
{
    protected $signature = 'signage:check-devices';

    protected $description = 'Alert once when a paired TV is offline for 5 minutes or stuck on one slide for 10';

    public function handle(SmsService $sms): int
    {
        $now = now();
        $smsOn = filter_var(SiteSetting::get('signage_device_alert_sms', '1'), FILTER_VALIDATE_BOOLEAN);
        $phone = trim((string) SiteSetting::get('business_phone', ''));
        $alerts = [];

        foreach (SignageDevice::query()->where('approved', true)->with('screen:id,name,slug')->get() as $device) {
            $meta = $device->meta ?? [];
            $name = $device->screen?->name ?: $device->device_id;
            $changed = false;

            $offline = SignageDeviceHealth::offlineMinutes($device, $now);
            if ($offline !== null && empty($meta['alerted_offline_at'])) {
                $alerts[] = "TV \"{$name}\" has been offline for {$offline} min";
                $meta['alerted_offline_at'] = $now->toIso8601String();
                $changed = true;
            } elseif ($offline === null && !empty($meta['alerted_offline_at'])) {
                Log::info("Signage: TV \"{$name}\" is back online", ['device_id' => $device->device_id]);
                unset($meta['alerted_offline_at']);
                $changed = true;
            }

            $stuck = SignageDeviceHealth::stuckMinutes($device, $now);
            if ($stuck !== null && empty($meta['alerted_stuck_at'])) {
                $slide = (string) ($meta['current_slide'] ?? '?');
                $alerts[] = "TV \"{$name}\" has shown the same slide ({$slide}) for {$stuck} min";
                $meta['alerted_stuck_at'] = $now->toIso8601String();
                $changed = true;
            } elseif ($stuck === null && !empty($meta['alerted_stuck_at'])) {
                unset($meta['alerted_stuck_at']);
                $changed = true;
            }

            if ($changed) {
                $device->meta = $meta;
                $device->save();
            }
        }

        if ($alerts === []) {
            $this->info('All paired TVs look fine.');

            return self::SUCCESS;
        }

        foreach ($alerts as $line) {
            Log::warning('Signage: ' . $line);
            $this->line($line);
        }

        if ($smsOn && $phone !== '') {
            $sms->send(new SmsMessage(
                to: $phone,
                message: 'Bake & Grill TV: ' . implode('; ', array_slice($alerts, 0, 3)) . '. Check Admin → TV Signage → Devices.',
                type: 'system',
                idempotencyKey: 'signage-device-alert:' . md5(implode('|', $alerts)) . ':' . $now->format('Y-m-d-H'),
            ));
        }

        return self::SUCCESS;
    }
}
