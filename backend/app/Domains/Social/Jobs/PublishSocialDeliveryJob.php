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

    public int $timeout = 120;

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
        // state instead of a delivery stuck in queued.
        $delivery = SocialPostDelivery::find($this->deliveryId);
        if ($delivery === null || $delivery->status !== SocialPostDelivery::STATUS_QUEUED) {
            return;
        }

        $delivery->forceFill(['status' => SocialPostDelivery::STATUS_FAILED])->save();
        $delivery->post?->refreshStatusFromDeliveries();
    }
}
