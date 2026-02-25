<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\SmsPromotion;
use App\Models\SmsPromotionRecipient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendSmsPromotionRecipient implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $recipientId) {}

    public function handle(SmsService $smsService): void
    {
        $recipient = SmsPromotionRecipient::find($this->recipientId);
        if (!$recipient || $recipient->status !== 'queued') {
            return;
        }

        $promotion = SmsPromotion::find($recipient->sms_promotion_id);
        if (!$promotion) {
            $recipient->update(['status' => 'failed', 'error_message' => 'Promotion not found']);

            return;
        }

        $log = $smsService->send(new SmsMessage(
            to: $recipient->phone,
            message: $promotion->message,
            type: 'promotion',
            referenceType: 'App\Models\SmsPromotion',
            referenceId: (string) $promotion->id,
            idempotencyKey: "sms-promo:{$promotion->id}:recipient:{$this->recipientId}",
        ));

        $sent = in_array($log->status, ['sent', 'demo'], true);

        if ($sent) {
            $recipient->update(['status' => 'sent', 'sent_at' => now()]);
            $promotion->increment('sent_count');
        } else {
            $recipient->update(['status' => 'failed', 'error_message' => $log->error_message ?? 'SMS send failed']);
            $promotion->increment('failed_count');
        }

        $remaining = SmsPromotionRecipient::where('sms_promotion_id', $promotion->id)
            ->where('status', 'queued')
            ->count();

        if ($remaining === 0) {
            $status = $promotion->failed_count > 0 ? 'failed' : 'sent';
            $promotion->update(['status' => $status, 'sent_at' => now()]);
        }
    }
}
