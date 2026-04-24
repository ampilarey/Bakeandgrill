<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Jobs;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\SmsCampaign;
use App\Models\SmsCampaignRecipient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Sends one SMS to one campaign recipient.
 * Queued with retry logic; updates campaign stats on completion.
 */
class SendSmsCampaignRecipientJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 60;
    public int $timeout = 60;

    public function __construct(
        private SmsCampaignRecipient $recipient,
    ) {}

    public function handle(SmsService $smsService): void
    {
        if ($this->recipient->status !== 'pending') {
            return;
        }

        // Re-load campaign fresh; the serialised relation may be stale or deleted.
        $campaign = SmsCampaign::find($this->recipient->sms_campaign_id);

        if (!$campaign) {
            Log::warning('SendSmsCampaignRecipientJob: campaign not found, marking recipient failed', [
                'recipient_id' => $this->recipient->id,
                'campaign_id' => $this->recipient->sms_campaign_id,
            ]);
            $this->recipient->markFailed('Campaign no longer exists');

            // Do not rethrow — nothing to retry.
            return;
        }

        try {
            $log = $smsService->send(new SmsMessage(
                to: $this->recipient->phone,
                message: $campaign->message,
                type: 'campaign',
                customerId: $this->recipient->customer_id,
                campaignId: $campaign->id,
                referenceType: SmsCampaign::class,
                referenceId: (string) $campaign->id,
                idempotencyKey: "campaign:{$campaign->id}:recipient:{$this->recipient->id}",
            ));

            if (in_array($log->status, ['sent', 'demo'], true)) {
                $this->recipient->markSent($log);
            } else {
                $this->recipient->markFailed($log->error_message ?? 'Gateway error', $log);
            }
        } catch (\Throwable $e) {
            Log::error('SendSmsCampaignRecipientJob: send failed', [
                'recipient_id' => $this->recipient->id,
                'campaign_id' => $campaign->id,
                'error' => $e->getMessage(),
            ]);

            $this->recipient->markFailed($e->getMessage());

            throw $e;
        } finally {
            // Refresh campaign stats regardless of send outcome.
            $campaign->updateStats();
        }
    }

    public function failed(\Throwable $e): void
    {
        Log::error('SendSmsCampaignRecipientJob: exhausted retries', [
            'recipient_id' => $this->recipient->id,
            'error' => $e->getMessage(),
        ]);

        if (app()->bound('sentry')) {
            \Sentry\captureException($e);
        }
    }
}
