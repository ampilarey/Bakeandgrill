<?php

declare(strict_types=1);

namespace App\Domains\Sms\Jobs;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\StaffNotificationLog;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendStaffNotificationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 3;
    public int $backoff  = 60;
    public int $timeout  = 60;

    public function __construct(
        public readonly int $orderId,
        public readonly string $eventType,
        public readonly string $phone,
        public readonly string $message,
        public readonly string $recipientType,
        public readonly ?int $recipientId,
        public readonly bool $fallbackUsed,
    ) {}

    public function handle(SmsService $smsService): void
    {
        $idempotencyKey = 'staff-notif:' . $this->orderId . ':' . $this->eventType . ':' . $this->phone;

        // Idempotency check: skip if already sent
        $existing = StaffNotificationLog::where('idempotency_key', $idempotencyKey)->first();
        if ($existing && $existing->status === 'sent') {
            Log::info('SendStaffNotificationJob: duplicate prevented', ['key' => $idempotencyKey]);

            return;
        }

        // Create or update the log record
        $logRecord = StaffNotificationLog::updateOrCreate(
            ['idempotency_key' => $idempotencyKey],
            [
                'order_id'       => $this->orderId,
                'event_type'     => $this->eventType,
                'recipient_type' => $this->recipientType,
                'recipient_id'   => $this->recipientId,
                'phone'          => $this->phone,
                'message'        => $this->message,
                'status'         => 'queued',
                'fallback_used'  => $this->fallbackUsed,
            ]
        );

        try {
            $smsLog = $smsService->send(new SmsMessage(
                to: $this->phone,
                message: $this->message,
                type: 'staff_notification',
                referenceType: 'order',
                referenceId: (string) $this->orderId,
                idempotencyKey: $idempotencyKey . ':sms',
            ));

            $logRecord->update([
                'status'     => $smsLog->status === 'sent' ? 'sent' : 'failed',
                'sms_log_id' => $smsLog->id,
                'sent_at'    => $smsLog->status === 'sent' ? now() : null,
                'failed_at'  => $smsLog->status !== 'sent' ? now() : null,
            ]);
        } catch (\Throwable $e) {
            $logRecord->update([
                'status'    => 'failed',
                'failed_at' => now(),
            ]);

            Log::error('SendStaffNotificationJob: SMS send failed', [
                'order_id'   => $this->orderId,
                'event_type' => $this->eventType,
                'phone'      => $this->phone,
                'error'      => $e->getMessage(),
            ]);

            throw $e;
        }
    }
}
