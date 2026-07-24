<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\RestorationSubscription;
use App\Models\ServiceIncident;
use App\Support\RestorationSmsBuilder;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Send a single restoration SMS for one subscription (plan §14 / Stage 6).
 *
 * Idempotent: keyed off `restore:{incident}:{subscription}` via the SmsService
 * idempotency ledger AND the subscription's `notified_at` timestamp. Re-dispatch
 * of the same subscription is a safe no-op.
 *
 * Never touches marketing tables. Always type = "transactional" so it is
 * excluded from broadcast/opt-out reports.
 */
class SendRestorationSmsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 60;

    public int $timeout = 60;

    public function __construct(public readonly int $subscriptionId) {}

    public function handle(SmsService $smsService, RestorationSmsBuilder $builder): void
    {
        /** @var RestorationSubscription|null $sub */
        $sub = RestorationSubscription::query()->find($this->subscriptionId);
        if (!$sub) {
            return;
        }

        if ($sub->status === 'notified' && $sub->notified_at !== null) {
            return;
        }

        $incident = $sub->service_incident_id
            ? ServiceIncident::query()->find($sub->service_incident_id)
            : null;

        $message = $builder->build($sub->service_key, $incident);
        $idempotencyKey = 'restore:' . ($sub->service_incident_id ?? 'null') . ':' . $sub->id;

        try {
            $smsLog = $smsService->send(new SmsMessage(
                to: $sub->normalized_mobile,
                message: $message,
                type: 'service_restoration',
                referenceType: 'restoration_subscription',
                referenceId: (string) $sub->id,
                idempotencyKey: $idempotencyKey,
            ));

            $success = in_array($smsLog->status, ['sent', 'demo'], true);

            DB::transaction(function () use ($sub, $smsLog, $success, $incident) {
                $sub->refresh();
                if ($success) {
                    $sub->status = 'notified';
                    $sub->notified_at = now();
                    $sub->attempts = ($sub->attempts ?? 0) + 1;
                    $sub->sms_log_id = $smsLog->id;
                    $sub->save();

                    if ($incident) {
                        ServiceIncident::query()
                            ->where('id', $incident->id)
                            ->update([
                                'notified_count' => DB::raw('COALESCE(notified_count, 0) + 1'),
                            ]);
                    }
                } else {
                    $sub->status = 'failed';
                    $sub->failed_at = now();
                    $sub->attempts = ($sub->attempts ?? 0) + 1;
                    $sub->sms_log_id = $smsLog->id;
                    $sub->save();
                }
            });
        } catch (\Throwable $e) {
            $sub->refresh();
            $sub->status = 'failed';
            $sub->failed_at = now();
            $sub->attempts = ($sub->attempts ?? 0) + 1;
            $sub->save();

            Log::error('SendRestorationSmsJob failed', [
                'subscription_id' => $sub->id,
                'service_key' => $sub->service_key,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    public function failed(\Throwable $e): void
    {
        Log::critical('SendRestorationSmsJob exhausted', [
            'subscription_id' => $this->subscriptionId,
            'error' => $e->getMessage(),
        ]);

        if (app()->bound('sentry')) {
            \Sentry\captureException($e);
        }
    }
}
