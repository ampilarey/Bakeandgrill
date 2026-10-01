<?php

declare(strict_types=1);

namespace App\Domains\Social\Jobs;

use App\Domains\Social\Services\SocialPublisher;
use App\Models\SocialPostDelivery;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Publishes one delivery. Carries only the row id (not the model) so a
 * stale serialized state can never publish over a cancel. Idempotent: the
 * publisher no-ops on terminal states, and retries only rethrow for
 * transient / rate-limit classifications.
 */
class PublishSocialDeliveryJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [60, 300];

    /**
     * Long enough for a ten-photo Instagram carousel or a Reel that
     * Instagram takes its time to process (Social Hub audit, 2026-10-01).
     * The old two minutes could be hit mid-carousel, and the worker then
     * killed the job with the delivery left "processing" for ever.
     */
    public int $timeout = 600;

    public function __construct(public readonly int $deliveryId) {}

    public function handle(SocialPublisher $publisher): void
    {
        $delivery = SocialPostDelivery::find($this->deliveryId);
        if ($delivery === null) {
            return;
        }

        $publisher->deliver($delivery);
    }

    public function failed(): void
    {
        // Retries exhausted on a transient error: leave an honest terminal
        // state instead of a delivery stuck in queued — and say so. Until
        // the 2026-09-24 audit this path was silent: a channel timing out
        // three times in a row told nobody.
        $delivery = SocialPostDelivery::find($this->deliveryId);
        if ($delivery === null) {
            return;
        }

        if ($delivery->status === SocialPostDelivery::STATUS_PROCESSING) {
            // The worker was stopped (timeout, restart) with the request
            // possibly already at the platform: unknown, not failed, so the
            // next attempt reconciles before posting again.
            $delivery->recordAttempt('unknown', 'Worker stopped mid-publish.');
            $delivery->forceFill([
                'status' => SocialPostDelivery::STATUS_UNKNOWN,
                'error_class' => SocialPostDelivery::ERROR_UNKNOWN,
                'error_message' => 'The worker stopped while publishing. Retry to check whether it went out.',
            ])->save();
            $delivery->post?->refreshStatusFromDeliveries();
            if ($delivery->channel !== null) {
                app(SocialPublisher::class)->alertFailure($delivery->channel, 'stopped mid-publish');
            }

            return;
        }

        if ($delivery->status !== SocialPostDelivery::STATUS_QUEUED) {
            return;
        }

        $delivery->recordAttempt('failed', 'Retries exhausted.');
        $delivery->forceFill([
            'status' => SocialPostDelivery::STATUS_FAILED,
            'error_message' => trim('Gave up after repeated attempts. ' . (string) $delivery->error_message),
        ])->save();
        $delivery->post?->refreshStatusFromDeliveries();

        if ($delivery->channel !== null) {
            app(SocialPublisher::class)->alertFailure($delivery->channel, 'retries exhausted');
        }
    }
}
