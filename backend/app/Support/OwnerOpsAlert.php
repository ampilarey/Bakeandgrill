<?php

declare(strict_types=1);

namespace App\Support;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * A text to the owner when the machinery behind the site stops (operations
 * audit, 2026-10-01): a scheduled task failing, the nightly backup included,
 * or the queue worker going quiet.
 *
 * Before, a failure went to the log and to Sentry when Sentry was set up, and
 * backup alerts went to an e-mail address that defaults to a placeholder. The
 * owner could go weeks without a backup and not know.
 *
 * One text per subject per throttle window, so a task failing every minute
 * sends one message, not sixty.
 */
final class OwnerOpsAlert
{
    public const SMS_TYPE = 'owner_ops_alert';

    public static function send(string $subject, string $body, int $throttleMinutes = 360): bool
    {
        $key = 'ops-alert:' . app()->environment() . ':' . sha1($subject);
        if (!Cache::add($key, now()->toIso8601String(), now()->addMinutes($throttleMinutes))) {
            return false;
        }

        try {
            $sms = app(SmsService::class);
            foreach (OwnerPhones::for(self::SMS_TYPE) as $phone) {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $body,
                    type: self::SMS_TYPE,
                    referenceType: 'ops',
                    referenceId: substr(sha1($subject), 0, 12),
                    idempotencyKey: 'ops:' . sha1($subject) . ':' . now()->format('YmdH') . ':' . $phone,
                ));
            }
        } catch (\Throwable $e) {
            Log::warning('ops.owner_alert_failed', ['subject' => $subject, 'error' => $e->getMessage()]);
        }

        return true;
    }
}
