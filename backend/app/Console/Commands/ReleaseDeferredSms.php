<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsDeliveryRules;
use App\Models\SmsCampaign;
use App\Models\SmsCampaignRecipient;
use App\Models\SmsLog;
use App\Models\SmsPromotion;
use App\Models\SmsPromotionRecipient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Sends the texts quiet hours held back (SMS audit, 2026-09-24). Runs
 * every five minutes; outside the quiet window it re-sends each
 * `deferred` row through the same gate, so a switch turned off or a
 * customer who opted out in the meantime is still honoured. Campaign and
 * promotion recipients are marked sent when their text goes.
 */
class ReleaseDeferredSms extends Command
{
    protected $signature = 'sms:release-deferred {--limit=500 : Most rows to release in one run}';

    protected $description = 'Send SMS held back by quiet hours once the window has ended';

    public function handle(SmsService $sms): int
    {
        if (SmsDeliveryRules::inQuietHours()) {
            $this->info('Quiet hours: nothing released.');

            return self::SUCCESS;
        }

        $rows = SmsLog::query()
            ->where('status', 'deferred')
            ->where('created_at', '>=', now()->subDays(3))
            ->orderBy('id')
            ->limit(max(1, (int) $this->option('limit')))
            ->get();

        $sent = 0;
        foreach ($rows as $row) {
            // The send path finds the held row by its idempotency key and
            // refreshes it in place; a row that never had one gets one now.
            if (!$row->idempotency_key) {
                $row->update(['idempotency_key' => 'deferred:' . $row->id]);
            }
            try {
                $log = $sms->send(new SmsMessage(
                    to: (string) $row->to,
                    message: (string) $row->message,
                    type: (string) $row->type,
                    customerId: $row->customer_id,
                    campaignId: $row->campaign_id,
                    referenceType: $row->reference_type,
                    referenceId: $row->reference_id,
                    idempotencyKey: (string) $row->idempotency_key,
                ));
            } catch (\Throwable $e) {
                Log::error('sms:release-deferred failed', ['sms_log_id' => $row->id, 'error' => $e->getMessage()]);

                continue;
            }
            if (in_array($log->status, ['sent', 'demo'], true)) {
                $sent++;
            }
            $this->syncBulkRecipient($log);
        }

        $this->info("Released {$rows->count()} deferred SMS; {$sent} sent.");

        return self::SUCCESS;
    }

    /** Campaign and promotion rows keep their own recipient status; bring it up to date. */
    private function syncBulkRecipient(SmsLog $log): void
    {
        $ok = in_array($log->status, ['sent', 'demo'], true);
        $key = (string) $log->idempotency_key;

        if (preg_match('/^campaign:(\d+):recipient:(\d+)$/', $key, $m) === 1) {
            $recipient = SmsCampaignRecipient::find((int) $m[2]);
            if ($recipient !== null && $recipient->status === 'pending') {
                $ok ? $recipient->markSent($log) : $recipient->markFailed($log->error_message ?? 'Gateway error', $log);
            }
            SmsCampaign::find((int) $m[1])?->updateStats();

            return;
        }

        if (preg_match('/^sms-promo:(\d+):recipient:(\d+)$/', $key, $m) === 1) {
            $recipient = SmsPromotionRecipient::find((int) $m[2]);
            $promotion = SmsPromotion::find((int) $m[1]);
            if ($recipient !== null && $recipient->status === 'queued') {
                $recipient->update($ok
                    ? ['status' => 'sent', 'sent_at' => now()]
                    : ['status' => 'failed', 'error_message' => $log->error_message ?? 'SMS send failed']);
                $promotion?->increment($ok ? 'sent_count' : 'failed_count');
            }
            if ($promotion !== null && !$promotion->recipients()->where('status', 'queued')->exists()) {
                $promotion->update(['status' => (int) $promotion->fresh()->failed_count > 0 ? 'failed' : 'sent', 'sent_at' => $promotion->sent_at ?? now()]);
            }
        }
    }
}
