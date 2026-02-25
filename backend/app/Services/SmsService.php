<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService as NotificationsSmsService;

/**
 * Backward-compatible adapter.
 *
 * Old code that uses `app(SmsService::class)` continues to work.
 * Delegates to the canonical service in app/Domains/Notifications.
 *
 * @deprecated Inject App\Domains\Notifications\Services\SmsService directly.
 */
class SmsService
{
    public function __construct(
        private NotificationsSmsService $inner,
    ) {}

    /**
     * Send a plain SMS. Returns true on success.
     * Logs to sms_logs automatically.
     */
    public function send(string $phone, string $message, string $type = 'transactional'): bool
    {
        $log = $this->inner->send(new SmsMessage(
            to: $phone,
            message: $message,
            type: $type,
        ));

        return in_array($log->status, ['sent', 'demo'], true);
    }

    /**
     * Estimate encoding, segments, and cost.
     */
    public function estimate(string $body): array
    {
        return $this->inner->estimate($body);
    }
}
